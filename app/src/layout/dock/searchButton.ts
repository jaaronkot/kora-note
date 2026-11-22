import {openSearch} from "../../search/spread";
import {Constants} from "../../constants";
import type {App} from "../../index";

/**
 * 全局搜索入口从顶栏移到左侧停靠栏，落在文件树入口下方；
 * 不设置 data-type，dock 的拖拽与可见性逻辑不会把它当作可拖动页签。
 */
export const mountSearchButton = (app: App) => {
    const dock = document.getElementById("dockLeft");
    if (!dock || document.getElementById("dockSearch")) {
        return;
    }
    const container = dock.querySelector(".dock__items");
    const fileItem = container?.querySelector(".dock__item[data-type=\"file\"]");
    if (!container || !fileItem) {
        return;
    }
    const button = document.createElement("span");
    button.id = "dockSearch";
    button.className = "dock__item ariaLabel";
    button.setAttribute("data-position", "8east");
    button.setAttribute("aria-label", window.siyuan.languages.globalSearch);
    button.innerHTML = "<svg><use xlink:href=\"#iconSearch\"></use></svg>";
    button.addEventListener("click", (event) => {
        event.stopPropagation();
        openSearch({app, hotkey: Constants.DIALOG_GLOBALSEARCH});
    });
    fileItem.after(button);
};
