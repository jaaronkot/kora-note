import type {SettingTabBuilder} from "../../setting/builder";
import {
    getAgentCapabilityKeywords,
    mountAgentCapabilityBlock,
} from "./aiCapabilityUi";
import {openMcpClientConfigDialog} from "./mcpClientConfig";

// 本 fork 的笔记由外部 AI 通过 MCP 操作，不使用内核内置的大模型能力，因此设置页的
// 人工智能页只展示 MCP 分组：把本工作空间暴露给外部 AI 客户端（能力）与生成客户端
// 配置（复制）。内置 Agent 用的外部 MCP 服务列表不再展示，内核侧的配置结构、接口与
// 实现均未改动，被隐藏的分组注册实现保留在 aiOptionalGroups.ts，需要时重新注册即可。

const registerAiMcpGroup = (tab: SettingTabBuilder) => {
    const group = tab.group("mcp", window.siyuan.languages.configGroupMcp);

    group.button({
        id: "aiMcpClientConfig",
        title: window.siyuan.languages.aiMcpClientConfig,
        desc: window.siyuan.languages.aiMcpClientConfigTip,
        label: window.siyuan.languages.copy,
        icon: "iconCopy",
        keywords: [window.siyuan.languages.aiMcpClientConfig, window.siyuan.languages.aiMcpClientConfigTip],
        afterMount: (root) => {
            root.querySelector("#aiMcpClientConfig")?.addEventListener("click", () => {
                openMcpClientConfigDialog();
            });
        },
    });
    group.button({
        id: "aiMcpCapabilities",
        title: window.siyuan.languages.agentCapabilities,
        desc: window.siyuan.languages.agentCapabilitiesMcpExposureTip,
        label: window.siyuan.languages.config,
        icon: "iconSettings",
        keywords: getAgentCapabilityKeywords(),
        afterMount: (root) => {
            mountAgentCapabilityBlock(root, "mcp", "aiMcpCapabilities");
        },
    });
};

export const registerAiTab = (tab: SettingTabBuilder) => {
    registerAiMcpGroup(tab);
};
