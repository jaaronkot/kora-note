import {escapeHtml} from "./escape";
import {pathPosix} from "./pathName";

let windowWorkspaceTitle = "";

export const setWindowWorkspaceTitle = (name: string) => {
    const prefix = windowWorkspaceTitle ? `${windowWorkspaceTitle} - ` : "";
    const title = prefix && document.title.startsWith(prefix) ? document.title.slice(prefix.length) : document.title;
    windowWorkspaceTitle = name;
    document.title = name ? `${name} - ${title}` : title;
};

export const getWorkspaceName = () => {
    const dir = window.siyuan.config.system.workspaceDir;
    // 浏览器环境下内核不返回工作空间绝对路径，回退到“工作空间”（Workspace）。
    // 不能用 siyuanNote：setTitle 的标题模板本身已含 siyuanNote，会导致“思源笔记 - 思源笔记”重复。
    // 注意：该函数可能在 languages 加载前（如 setBodyHighlight）被调用，故用可选链，
    // 此时返回 undefined，由调用方（setBodyHighlight 的 if(!name) return）跳过处理
    // https://github.com/siyuan-note/siyuan/issues/17410
    return dir ? pathPosix().basename(dir.replace(/\\/g, "/")) : window.siyuan.languages?.workspace;
};

export const setTitle = (title: string, showBrandTitle = false, iconElement?: Element) => {
    const dragElement = document.getElementById("drag");
    const brandName = window.siyuan?.languages?.siyuanNote || "Kora Note";
    if (showBrandTitle) {
        document.title = brandName;
        if (!window.siyuan.config.appearance.hideToolbar && dragElement) {
            dragElement.textContent = brandName;
            dragElement.setAttribute("title", brandName);
        }
    } else {
        title = title.trim() || window.siyuan.languages["_kernel"][16];
        // 顶部标题栏只显示文档名与品牌名，不带工作空间名与版本号。
        const fullTitle = `${title} - ${brandName}`;
        document.title = fullTitle;
        if (!window.siyuan.config.appearance.hideToolbar && dragElement) {
            dragElement.setAttribute("title", fullTitle);
            dragElement.innerHTML = escapeHtml(fullTitle);
            if (iconElement) {
                const content = document.createElement("span");
                content.className = "toolbar__title-content";
                const text = document.createElement("span");
                text.className = "fn__ellipsis";
                text.textContent = fullTitle;
                const icon = document.createElement("span");
                icon.className = "toolbar__title-icon";
                icon.setAttribute("aria-hidden", "true");
                iconElement.childNodes.forEach(node => icon.appendChild(node.cloneNode(true)));
                content.append(icon, text);
                dragElement.replaceChildren(content);
            }
        }
    }
    if (windowWorkspaceTitle) {
        document.title = `${windowWorkspaceTitle} - ${document.title}`;
    }
};

// 启动时恢复的文档标题可能已经就绪，按当前聚焦标签页同步标题，避免被品牌名覆盖。
export const syncTitleFromFocusedTab = () => {
    const tabHeader = document.querySelector(".layout__wnd--active .layout-tab-bar .item--focus[data-type='tab-header']") ||
        document.querySelector(".layout-tab-bar .item--focus[data-type='tab-header']");
    const title = tabHeader?.querySelector(".item__text")?.textContent || "";
    setTitle(title, !title, tabHeader?.querySelector(".item__icon"));
};
