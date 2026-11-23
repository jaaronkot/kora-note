import {MobileDialog} from "../../../dialog/mobileDialog";
import {showMessage} from "../../../dialog/message";
import {writeClipboardData} from "../../../protyle/util/compatibility";
import {escapeHtmlTextAndAttr} from "../../../util/escape";

/** 内核主服务使用随机端口；6806 是内核默认启动的固定端口反代，外部客户端不必跟随随机端口变化。 */
const FIXED_MCP_PORT = "6806";

/** MCP 服务端地址：内核把 MCP 端点挂在根路由的 /mcp 上，本机访问固定走 6806 反代。 */
const getMcpEndpoint = (): string => {
    if (["127.0.0.1", "localhost", "[::1]"].includes(window.location.hostname)) {
        return `http://127.0.0.1:${FIXED_MCP_PORT}/mcp`;
    }
    return `${window.location.origin}/mcp`;
};

/** 工作空间 API Token 是 MCP 端点的管理员级凭据。 */
const getMcpToken = (): string => window.siyuan.config.api?.token || "";

/** 客户端配置名，统一用产品名，便于用户在客户端列表里辨认。 */
const CLIENT_NAME = "koranote";

/** 生成 Claude Desktop / Cursor 通用的 mcpServers 配置。 */
export const genMcpClientConfigJSON = (): string => JSON.stringify({
    mcpServers: {
        [CLIENT_NAME]: {
            type: "http",
            url: getMcpEndpoint(),
            headers: {
                Authorization: `Bearer ${getMcpToken()}`,
            },
        },
    },
}, null, 2);

/** 生成 Claude Code 命令行。 */
export const genMcpClientConfigCommand = (): string =>
    `claude mcp add --transport http ${CLIENT_NAME} ${getMcpEndpoint()} --header "Authorization: Bearer ${getMcpToken()}"`;

/** 生成 Cursor 的 .cursor/mcp.json 内容。 */
export const genMcpClientConfigCursor = (): string => JSON.stringify({
    mcpServers: {
        [CLIENT_NAME]: {
            type: "http",
            url: getMcpEndpoint(),
            headers: {
                Authorization: `Bearer ${getMcpToken()}`,
            },
        },
    },
}, null, 2);

interface IClientConfigSection {
    title: string;
    hint: string;
    content: string;
}

const buildSections = (): IClientConfigSection[] => [
    {
        title: window.siyuan.languages.aiMcpClientConfigClaudeDesktop,
        hint: window.siyuan.languages.aiMcpClientConfigClaudeDesktopTip,
        content: genMcpClientConfigJSON(),
    },
    {
        title: window.siyuan.languages.aiMcpClientConfigCursor,
        hint: window.siyuan.languages.aiMcpClientConfigCursorTip,
        content: genMcpClientConfigCursor(),
    },
    {
        title: window.siyuan.languages.aiMcpClientConfigClaudeCode,
        hint: window.siyuan.languages.aiMcpClientConfigClaudeCodeTip,
        content: genMcpClientConfigCommand(),
    },
];

/** 打开对话框展示三种客户端配置，并提供逐段复制。 */
export const openMcpClientConfigDialog = () => {
    const sections = buildSections();
    const dialog = new MobileDialog({
        title: window.siyuan.languages.aiMcpClientConfig,
        width: "min(760px, 92vw)",
        height: "80vh",
        content: `<div class="b3-dialog__content">
    <div class="b3-label__text">${escapeHtmlTextAndAttr(window.siyuan.languages.aiMcpClientConfigTip)}</div>
    ${sections.map((section, index) => `<div class="b3-label b3-label--inner">
        <div class="config-name">${escapeHtmlTextAndAttr(section.title)}</div>
        <div class="b3-label__text">${escapeHtmlTextAndAttr(section.hint)}</div>
        <pre data-type="mcpClientConfig" data-index="${index}" tabindex="0" style="margin: 0; max-height: 30vh; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; user-select: text;"></pre>
        <div class="fn__flex fn__flex-center" style="gap: 8px;">
            <button type="button" data-action="copyMcpClientConfig" data-index="${index}" class="b3-button b3-button--text">${escapeHtmlTextAndAttr(window.siyuan.languages.copy)}</button>
        </div>
    </div>`).join("")}
</div>`,
    });
    sections.forEach((section, index) => {
        const pre = dialog.element.querySelector<HTMLElement>(`[data-type="mcpClientConfig"][data-index="${index}"]`);
        if (pre) {
            pre.textContent = section.content;
        }
    });
    dialog.element.querySelectorAll<HTMLButtonElement>("[data-action='copyMcpClientConfig']").forEach((button) => {
        button.addEventListener("click", async () => {
            const index = Number(button.dataset.index);
            const section = sections[index];
            if (!section) {
                return;
            }
            const result = await writeClipboardData({textPlain: section.content});
            if (result.status === "failed") {
                showMessage(window.siyuan.languages.clipboardPermissionDenied, 7000, "error");
                return;
            }
            showMessage(window.siyuan.languages.copied);
        });
    });
};
