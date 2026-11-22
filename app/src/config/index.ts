/// #if MOBILE
import {openMobileSetting} from "../mobile/menu";
/// #else
import {initSettingSearch, switchSettingTab} from "./search/dialog";
import {bindSettingSaveDelegation} from "./setting/save";
import {Dialog} from "../dialog";
import {Constants} from "../constants";
import {focusByRange} from "../protyle/util/selectionOffsets";
import {initSettingDrag} from "./setting/drag";
/// #endif
import {escapeHtmlTextAndAttr} from "../util/escape";
import {getSettingTabDefs} from "./setting/tabs";
import {clearAccessTabElement} from "./tabs/accessRuntime";
import {clearSyncTabElement} from "./tabs/syncRuntime";
import {openChatGPTProvider} from "./tabs/ai/aiProviderUi";
import type {TSettingTab} from "./setting/tabs";
import type {App} from "../index";
import {unmountAssetsTab} from "./assets";
import {getHostCapabilities} from "../util/hostCapabilities";
import {unmountWorkspaceStorage} from "./tabs/workspaceStorage";
/// #if !MOBILE
import {openNativeSettings} from "./setting/nativeWindow";
import {closeSettingDialog, prepareSettingDialog} from "./setting/interface";
import {isSettingsWindow} from "./setting/windowContext";
import {fitSettingsWindowDialog} from "./setting/windowDialog";
/// #endif

/// #if !MOBILE
export const openSettingDialog = (app: App, initialTab: TSettingTab = "editor") => {
    /// #if !BROWSER
    if (!isSettingsWindow()) {
        prepareSettingDialog();
    }
    /// #endif
    closeSettingDialog();
    let range: Range;
    if (getSelection().rangeCount > 0) {
        range = getSelection().getRangeAt(0);
    }
    const tabListItems: string[] = [];
    const tabPanels: string[] = [];
    for (const def of getSettingTabDefs()) {
        const isActive = def.id === initialTab;
        tabListItems.push(`<li data-name="${def.id}" title="${escapeHtmlTextAndAttr(def.title)}" tabindex="0" role="button" class="b3-list-item${isActive ? " b3-list-item--focus" : ""}${def.hidden ? " fn__none" : ""}"><svg class="b3-list-item__graphic"><use xlink:href="#${def.icon}"></use></svg><span class="b3-list-item__text">${def.title}</span></li>`);
        tabPanels.push(`<div class="config__tab-container${isActive ? "" : " fn__none"}" data-name="${def.id}"></div>`);
    }
    const settingDialogRef: {element?: HTMLElement} = {};
    const dialog = new Dialog({
        content: `<div class="fn__flex-1 fn__flex config__panel" style="overflow: hidden;position: relative">
    <div class="config__side b3-list b3-list--background">
        <div class="config__tab-head">
            <div class="config__tab-title resize__move">
                <svg class="b3-list-item__graphic"><use xlink:href="#iconSettings"></use></svg>
                <span class="b3-list-item__text">${window.siyuan.languages.config}</span>
            </div>
            <input spellcheck="false" placeholder="${window.siyuan.languages.searchPlaceholder}" class="b3-text-field fn__block">
        </div>
        <ul class="config__tab-scroll" tabindex="-1">
            ${tabListItems.join("")}
        </ul>
    </div>
    <div class="config__tab-wrap">
        ${tabPanels.join("")}
    </div>
</div>`,
        width: "max(70vw, min(90vw, 900px))",
        height: "90vh",
        destroyCallback() {
            disposeDrag?.();
            const assetsRoot = settingDialogRef.element?.querySelector('.config__tab-container[data-name="assets"]');
            if (assetsRoot) {
                unmountAssetsTab(assetsRoot);
            }
            clearSyncTabElement();
            clearAccessTabElement();
            const appRoot = settingDialogRef.element?.querySelector<HTMLElement>('.config__tab-container[data-name="app"]');
            if (appRoot) {
                unmountWorkspaceStorage(appRoot);
            }
            if (range) {
                focusByRange(range);
            }
            if (isSettingsWindow()) {
                window.close();
            }
        },
    });
    settingDialogRef.element = dialog.element;
    const disposeDrag = isSettingsWindow() ? undefined : initSettingDrag(dialog.element);
    dialog.element.setAttribute("data-key", Constants.DIALOG_SETTING);

    const tabWrap = dialog.element.querySelector(".config__tab-wrap") as HTMLElement;
    bindSettingSaveDelegation(tabWrap);
    initSettingSearch(dialog.element, app);
    (dialog.element.querySelector(".b3-dialog__container") as HTMLElement).style.maxWidth = "1280px";
    dialog.element.querySelectorAll(".config__side .b3-list-item").forEach(item => {
        // 兼容社区 JS 代码片段模拟点击，不做事件委托
        item.addEventListener("click", () => {
            const tabId = item.getAttribute("data-name") as TSettingTab;
            switchSettingTab(dialog.element, app, tabId);
        });
        item.addEventListener("keydown", (event: KeyboardEvent) => {
            if (!event.isComposing && (event.key === "Enter" || event.key === " ")) {
                event.preventDefault();
                event.stopPropagation();
                (item as HTMLElement).click();
            }
        });
    });
    switchSettingTab(dialog.element, app, initialTab);
    if (isSettingsWindow()) {
        fitSettingsWindowDialog(dialog);
    }
    return dialog;
};
/// #endif

export const openPluginSetting = (app: App) => {
    /// #if MOBILE
    openMobileSetting(app);
    /// #else
    return openSettingDialog(app);
    /// #endif
};

export const openSetting = (app: App, tab?: TSettingTab, options?: {aiProvider?: "chatgpt"}) => {
    const aiProvider = options?.aiProvider;
    if (tab === "export" && !getHostCapabilities().documentImportExport) {
        return;
    }
    /// #if MOBILE
    openMobileSetting(app, tab);
    if (aiProvider === "chatgpt") { openChatGPTProvider(); }
    /// #else
    /// #if !BROWSER
    // 是否在独立窗口中打开设置界面，仅桌面端 Electron 客户端生效
    if (!isSettingsWindow() && window.siyuan.config.system.settingsWindow) {
        closeSettingDialog();
        void openNativeSettings(app, {tab, ...options});
        return;
    }
    /// #endif
    if (isSettingsWindow()) {
        const dialog = window.siyuan.dialogs.find(item => item.element.getAttribute("data-key") === Constants.DIALOG_SETTING);
        if (dialog) {
            switchSettingTab(dialog.element, app, tab || "editor");
            if (aiProvider === "chatgpt") { openChatGPTProvider(); }
            return dialog;
        }
    }
    const dialog = openSettingDialog(app, tab);
    if (aiProvider === "chatgpt") { openChatGPTProvider(); }
    return dialog;
    /// #endif
};


