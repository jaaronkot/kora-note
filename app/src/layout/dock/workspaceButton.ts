import type {App} from "../../index";
import {workspaceMenu} from "../../menus/workspace";

/**
 * 左侧 dock 底端的主菜单按钮：主菜单从顶栏移到 dock 后，菜单在按钮右上方展开，
 * 既避开窗口左边界，也避开底栏。
 */
export const mountWorkspaceMenuButton = (app: App) => {
    const dock = document.getElementById("dockLeft");
    if (!dock || document.getElementById("dockWorkspaceMenu")) {
        return;
    }
    const button = document.createElement("span");
    button.id = "dockWorkspaceMenu";
    // 复用 dock__item 的视觉样式；不设置 data-type，dock 的拖拽逻辑不会把它当作可拖动页签。
    button.className = "dock__item ariaLabel";
    button.setAttribute("data-position", "8east");
    button.setAttribute("aria-label", window.siyuan.languages.mainMenu);
    button.innerHTML = "<svg><use xlink:href=\"#iconSettings\"></use></svg>";
    button.addEventListener("click", (event) => {
        event.stopPropagation();
        workspaceMenu(app, button.getBoundingClientRect(), false, button);
    });
    // 插到底部 dock 图标段之前，使按钮落在左侧图标栏的最下端；底部 dock 重建自身按钮时不会覆盖它。
    const bottomSegment = dock.lastElementChild;
    if (bottomSegment) {
        dock.insertBefore(button, bottomSegment);
    } else {
        dock.appendChild(button);
    }
};
