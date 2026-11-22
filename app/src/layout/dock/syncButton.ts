import dayjs from "dayjs";
import type {App} from "../../index";
import {syncGuide} from "../../sync/syncGuide";
import {updateHotkeyTip} from "../../protyle/util/compatibility";
import {fetchPost} from "../../util/fetch";
import {processSync} from "../../dialog/processSystem";

/**
 * 云同步入口从顶栏移到左侧停靠栏底端、设置齿轮按钮上方；
 * 不设置 data-type，dock 的拖拽与可见性逻辑不会把它当作可拖动页签。
 * 元素沿用 barSync 标识，避免插件与同步图标更新逻辑失效。
 */
export const mountSyncButton = (app: App) => {
    const workspaceButton = document.getElementById("dockWorkspaceMenu");
    if (!workspaceButton || document.getElementById("barSync")) {
        return;
    }
    const button = document.createElement("span");
    button.id = "barSync";
    button.className = "dock__item ariaLabel";
    if (window.siyuan.config.readonly) {
        button.classList.add("fn__none");
    }
    button.setAttribute("data-position", "8east");
    button.setAttribute("aria-label", window.siyuan.config.sync.stat ||
        (window.siyuan.languages.syncNow + " " + updateHotkeyTip(window.siyuan.config.keymap.general.syncNow.custom)));
    button.innerHTML = "<svg><use xlink:href=\"#iconCloudSucc\"></use></svg>";
    button.addEventListener("click", (event) => {
        event.stopPropagation();
        syncGuide(app);
    });
    button.addEventListener("mouseenter", (event) => {
        event.stopPropagation();
        event.preventDefault();
        fetchPost("/api/sync/getSyncInfo", {}, (response) => {
            let html = "";
            if (!window.siyuan.config.sync.enabled) {
                html = response.data.stat;
            } else {
                html = window.siyuan.languages._kernel[82].replace("%s", dayjs(response.data.synced).format("YYYY-MM-DD HH:mm")) + "<br>";
                html += "&emsp;" + response.data.stat;
                if (response.data.kernels.length > 0) {
                    html += "<br>";
                    html += window.siyuan.languages.currentKernel + "<br>";
                    html += "&emsp;" + response.data.kernel + "/" + window.siyuan.config.system.kernelVersion +
                        " (" + window.siyuan.config.system.os + "/" + window.siyuan.config.system.name + ")<br>";
                    html += window.siyuan.languages.otherOnlineKernels + "<br>";
                    response.data.kernels.forEach((item: {
                        os: string;
                        ver: string;
                        hostname: string;
                        id: string;
                    }) => {
                        html += `&emsp;${item.id}/${item.ver} (${item.os}/${item.hostname}) <br>`;
                    });
                }
            }
            button.setAttribute("aria-label", html);
        });
    });
    workspaceButton.before(button);
    // 顶栏的同步按钮已移除，这里补一次图标状态同步。
    processSync();
};
