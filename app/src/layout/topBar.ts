import {toggleMenu} from "../menus/menuToggle";
import {
    isInMobileApp,
    setStorageVal,
    updateHotkeyTip
} from "../protyle/util/compatibility";
import {exitSiYuan, processSync} from "../dialog/processSystem";
import {goBack, goForward} from "../util/backForward";
import {initTopBarMenu} from "../menus/topBar";
import {MenuItem} from "../menus/Menu";
import {hideTooltip} from "../dialog/tooltip";
import {openSetting} from "../config";
import type {App} from "../index";
/// #if !BROWSER
import {ipcRenderer, webFrame} from "electron";
/// #endif
import {Constants} from "../constants";
import {isBrowser, isWindow, setToolbarLeftMac} from "../util/functions";
import {exportLayout, resizeTopBar} from "./util";
import {setTabPosition} from "./tabUtil";
import {setTitle} from "../util/processTitle";
import {bindTopBarDrag} from "./topBarDrag";
import {
    applyTopBarEntryVisibility,
    setEntryOrderValue,
} from "../config/entryVisibility/runtime";
import {TOP_BAR_ROOT_PATH} from "../config/entryVisibility/catalog";

const sendTrafficLightPosition = (zoom: number) => {
    /// #if !BROWSER
    const position = Constants.SIZE_ZOOM.find((item) => item.zoom === zoom).position;
    ipcRenderer.send(Constants.SIYUAN_CMD, {
        cmd: "setTrafficLightPosition",
        zoom,
        position: {
            x: position.x,
            y: ((window.siyuan.config.appearance.hideToolbar && !isWindow()) ? 5 * zoom : 0) + position.y,
        },
    });
    /// #endif
};

/** 同步顶栏隐藏后的布局（运行时切换 hideToolbar 时调用） */
export const syncHideToolbarLayout = () => {
    document.body.classList.toggle("body--toolbar-hide", window.siyuan.config.appearance.hideToolbar);
    resizeTopBar();
    /// #if !BROWSER
    if (!isWindow()) {
        sendTrafficLightPosition(window.siyuan.storage[Constants.LOCAL_ZOOM]);
        if (!window.siyuan.config.appearance.hideToolbar) {
            const tabHeader = document.querySelector('.layout__wnd--active .layout-tab-bar .item--focus[data-type="tab-header"]') ||
                document.querySelector('.layout-tab-bar .item--focus[data-type="tab-header"]');
            const title = tabHeader?.querySelector(".item__text")?.textContent || "";
            setTitle(title, !title, tabHeader?.querySelector(".item__icon"));
        }
    } else {
        return;
    }
    /// #endif
    setTabPosition(false, true);
};

export const initBar = (app: App) => {
    const toolbarElement = document.getElementById("toolbar");
    toolbarElement.innerHTML = `
<button id="barBack" data-topbar-entry="barBack" class="ariaLabel toolbar__item toolbar__item--disabled" aria-label="${window.siyuan.languages.goBack} ${updateHotkeyTip(window.siyuan.config.keymap.general.goBack.custom)}">
    <svg><use xlink:href="#iconBack"></use></svg>
</button>
<button id="barForward" data-topbar-entry="barForward" class="ariaLabel toolbar__item toolbar__item--disabled" aria-label="${window.siyuan.languages.goForward} ${updateHotkeyTip(window.siyuan.config.keymap.general.goForward.custom)}">
    <svg><use xlink:href="#iconForward"></use></svg>
</button>
<div class="fn__flex-1 fn__ellipsis" id="drag"><span class="fn__none">开发版，使用前请进行备份 Development version, please backup before use</span></div>
<div id="barZoom" data-topbar-entry="barZoom" class="toolbar__item ariaLabel${(window.siyuan.storage[Constants.LOCAL_ZOOM] === 1 || isBrowser()) ? " fn__none" : ""}" aria-label="${window.siyuan.languages.zoom}">
    <svg><use xlink:href="#iconZoom${window.siyuan.storage[Constants.LOCAL_ZOOM] > 1 ? "In" : "Out"}"></use></svg>
</div>
${isInMobileApp() ? `<div id="barExit" data-topbar-entry="barExit" class="ft__error toolbar__item ariaLabel" aria-label="${window.siyuan.languages.safeQuit}">
    <svg><use xlink:href="#iconQuit"></use></svg>
</div>` : ""}
<div id="barMore" class="toolbar__item ariaLabel" aria-label="${window.siyuan.languages.more}">
    <svg><use xlink:href="#iconMore"></use></svg>
</div>
<div class="fn__flex" id="windowControls"></div>`;
    applyTopBarEntryVisibility();
    bindTopBarDrag(toolbarElement, (order) => setEntryOrderValue(TOP_BAR_ROOT_PATH, order));
    const updateTopBarLayout = () => {
        applyTopBarEntryVisibility();
        resizeTopBar();
        setTabPosition(true);
    };
    window.addEventListener("siyuan-entry-visibility", updateTopBarLayout);
    window.addEventListener("siyuan-topbar-change", updateTopBarLayout);
    processSync();
    /// #if !BROWSER
    ipcRenderer.on(Constants.SIYUAN_TOPBAR_CONTEXT_MENU, (event, position: IPosition) => {
        hideTooltip();
        initTopBarMenu().popup(position);
    });
    /// #endif
    toolbarElement.addEventListener("click", (event: MouseEvent) => {
        let target = event.target as HTMLElement;
        if (typeof event.detail === "string") {
            target = toolbarElement.querySelector("#" + event.detail);
        }
        while (!target.classList.contains("toolbar")) {
            const targetId = typeof event.detail === "string" ? event.detail : target.id;
            if (targetId === "barBack") {
                goBack(app);
                event.stopPropagation();
                break;
            } else if (targetId === "barMore") {
                toggleMenu({
                    target: target,
                    build: (_menu, session) => {
                        window.siyuan.menus.menu.element.setAttribute("data-name", Constants.MENU_BAR_MORE);
                        (target.getAttribute("data-hideids") || "").split(",").forEach((itemId) => {
                            // data-hideids 可能为空字符串，split(",") 会得到 [""]，导致 querySelector("#") 抛出无效选择器异常
                            if (!itemId) {
                                return;
                            }
                            const hideElement = document.getElementById(itemId);
                            const useElement = hideElement.querySelector("use");
                            const menuOptions: IMenu = {
                                label: hideElement.getAttribute("aria-label"),
                                icon: useElement ? useElement.getAttribute("xlink:href").substring(1) : undefined,
                                click: () => {
                                    if (itemId.startsWith("plugin")) {
                                        hideElement.dispatchEvent(new CustomEvent("click"));
                                    } else {
                                        toolbarElement.dispatchEvent(new CustomEvent("click", {detail: itemId}));
                                    }
                                }
                            };
                            if (!useElement && hideElement.querySelector("svg")) {
                                const svgElement = hideElement.querySelector("svg").cloneNode(true) as HTMLElement;
                                svgElement.classList.add("b3-menu__icon");
                                menuOptions.iconHTML = svgElement.outerHTML;
                            }
                            window.siyuan.menus.menu.append(new MenuItem(menuOptions).element);
                        });
                        const rect = target.getBoundingClientRect();
                        session.show(() => window.siyuan.menus.menu.popup({x: rect.right, y: rect.bottom, h: rect.height, isLeft: true}));

                    },
                });
            event.stopPropagation();
                break;
            } else if (targetId === "barForward") {
                goForward(app);
                event.stopPropagation();
                break;
            } else if (targetId === "barExit") {
                event.stopPropagation();
                exportLayout({
                    errorExit: true,
                    cb: exitSiYuan,
                });
                break;
            } else if (targetId === "toolbarVIP" || targetId === "toolbarTitle") {
                if (!window.siyuan.config.readonly) {
                    openSetting(app, "sync");
                }
                event.stopPropagation();
                break;
            } else if (targetId === "barZoom") {
                toggleMenu({
                    target: target,
                    build: (_menu, session) => {
                        window.siyuan.menus.menu.element.setAttribute("data-name", Constants.MENU_BAR_ZOOM);
                        window.siyuan.menus.menu.append(new MenuItem({
                            label: window.siyuan.languages.zoomIn,
                            icon: "iconZoomIn",
                            accelerator: "⌘=",
                            click: () => {
                                setZoom("zoomIn");
                            }
                        }).element);
                        window.siyuan.menus.menu.append(new MenuItem({
                            label: window.siyuan.languages.zoomOut,
                            accelerator: "⌘-",
                            icon: "iconZoomOut",
                            click: () => {
                                setZoom("zoomOut");
                            }
                        }).element);
                        window.siyuan.menus.menu.append(new MenuItem({
                            label: window.siyuan.languages.reset,
                            icon: "iconRefresh",
                            accelerator: "⌘0",
                            click: () => {
                                setZoom("restore");
                            }
                        }).element);
                        let rect = target.getBoundingClientRect();
                        if (rect.width === 0) {
                            rect = toolbarElement.querySelector("#barMore").getBoundingClientRect();
                        }
                        session.show(() => window.siyuan.menus.menu.popup({x: rect.right, y: rect.bottom, h: rect.height, isLeft: true}));

                    },
                });
            event.stopPropagation();
                break;
            }
            target = target.parentElement;
        }
    });
    if (window.siyuan.config.appearance.hideToolbar) {
        document.body.classList.add("body--toolbar-hide");
    }
};

export const setZoom = (type: "zoomIn" | "zoomOut" | "restore") => {
    /// #if !BROWSER
    let zoom = 1;
    if (type === "zoomIn") {
        Constants.SIZE_ZOOM.find((item, index) => {
            if (item.zoom === window.siyuan.storage[Constants.LOCAL_ZOOM]) {
                zoom = Constants.SIZE_ZOOM[index + 1]?.zoom || 3;
                return true;
            }
        });
    } else if (type === "zoomOut") {
        Constants.SIZE_ZOOM.find((item, index) => {
            if (item.zoom === window.siyuan.storage[Constants.LOCAL_ZOOM]) {
                zoom = Constants.SIZE_ZOOM[index - 1]?.zoom || 0.67;
                return true;
            }
        });
    }

    webFrame.setZoomFactor(zoom);
    setToolbarLeftMac(zoom);
    sendTrafficLightPosition(zoom);
    window.siyuan.storage[Constants.LOCAL_ZOOM] = zoom;
    setStorageVal(Constants.LOCAL_ZOOM, zoom);
    if (!isWindow()) {
        const barZoomElement = document.getElementById("barZoom");
        if (zoom === 1) {
            barZoomElement.classList.add("fn__none");
        } else {
            if (zoom > 1) {
                barZoomElement.querySelector("use").setAttribute("xlink:href", "#iconZoomIn");
            } else {
                barZoomElement.querySelector("use").setAttribute("xlink:href", "#iconZoomOut");
            }
            barZoomElement.classList.remove("fn__none");
        }
    }
    /// #endif
};
