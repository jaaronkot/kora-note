import {mobileInputDialog as openInputDialog} from "../dialog/mobileInputDialog";
import {Constants} from "../constants";
import {showMessage} from "../dialog/message";
import {isMobile} from "./functions";
import {fetchPost, fetchSyncPost} from "./fetch";
import {ContractFormData} from "./contractFormData";
import {MobileDialog as Dialog} from "../dialog/mobileDialog";
import {normalizeNotebookName, validateName} from "../editor/rename";
import {escapeHtml} from "../util/escape";
import type {App} from "../index";
import {getHostCapabilities} from "./hostCapabilities";
/// #if !BROWSER
import {ipcRenderer} from "electron";
import {importObsidianVault} from "../menus/importObsidian";
import * as path from "path";
/// #endif

export const mountHelp = () => {
    const notebookId = Constants.HELP_PATH[window.siyuan.config.appearance.lang];
    fetchPost("/api/notebook/removeNotebook", {notebook: notebookId}, () => {
        fetchPost("/api/notebook/openNotebook", {
            notebook: notebookId,
            app: Constants.SIYUAN_APPID,
        });
    });
};

export const importNotebook = (file: File) => {
    if (!getHostCapabilities().documentImportExport) {
        return;
    }
    const formData = new ContractFormData({file});
    fetchPost("/api/import/importSYNotebook", formData);
};

export const newNotebook = () => {
    let nativeImportHTML = "";
    /// #if !BROWSER
    if (getHostCapabilities().localFileSystem) {
        nativeImportHTML = `<div class="b3-list-item fn__pointer" data-type="import-markdown-file" role="button" tabindex="0"><svg class="b3-list-item__graphic"><use xlink:href="#iconMarkdown"></use></svg><span class="b3-list-item__text">Markdown ${window.siyuan.languages.doc}</span></div>
        <div class="b3-list-item fn__pointer" data-type="import-markdown-folder" role="button" tabindex="0"><svg class="b3-list-item__graphic"><use xlink:href="#iconFolder"></use></svg><span class="b3-list-item__text">Markdown ${window.siyuan.languages.folder}</span></div>
        <div class="b3-list-item fn__pointer" data-type="import-obsidian" role="button" tabindex="0"><svg class="b3-list-item__graphic"><use xlink:href="#iconObsidian"></use></svg><span class="b3-list-item__text">Obsidian Vault</span></div>`;
    }
    /// #endif
    const importHTML = getHostCapabilities().documentImportExport ? `<div class="fn__hr"></div>
    <div class="b3-label__text fn__pointer fn__flex" style="align-items: center;gap: 4px" data-type="toggle-import" role="button" tabindex="0" aria-expanded="false"><svg class="b3-list-item__arrow" style="display: block;flex: none;height: 14px;width: 14px" data-type="import-arrow"><use xlink:href="#iconRight"></use></svg><span style="line-height: 20px">${window.siyuan.languages.importFromMoreApps}</span></div>
    <div class="b3-list--background fn__none" data-type="import-options" style="padding-top: 8px">
        <label class="b3-list-item fn__pointer" data-type="import-sy"><svg class="b3-list-item__graphic"><use xlink:href="#iconSiYuan"></use></svg><span class="b3-list-item__text">Kora.sy.zip</span><input class="b3-form__upload" type="file" accept="application/zip"></label>
        <label class="b3-list-item fn__pointer" data-type="import-markdown-zip"><svg class="b3-list-item__graphic"><use xlink:href="#iconMarkdown"></use></svg><span class="b3-list-item__text">Markdown .zip</span><input class="b3-form__upload" type="file" accept="application/zip"></label>
        ${nativeImportHTML}
    </div>` : "";
    const dialog = new Dialog({
        title: window.siyuan.languages.newNotebook,
        content: `<div class="b3-dialog__content">
    <input placeholder="${window.siyuan.languages.notebookName}" class="b3-text-field fn__block" data-type="notebook-name">
    ${importHTML}
</div>
<div class="b3-dialog__action">
    <button class="b3-button b3-button--cancel" data-type="cancel">${window.siyuan.languages.cancel}</button><div class="fn__space"></div>
    <button class="b3-button b3-button--text" data-type="confirm">${window.siyuan.languages.confirm}</button>
</div>`,
        width: isMobile() ? "92vw" : "520px"
    });
    dialog.element.setAttribute("data-key", Constants.DIALOG_CREATENOTEBOOK);
    const cancelElement = dialog.element.querySelector('[data-type="cancel"]');
    const confirmElement = dialog.element.querySelector('[data-type="confirm"]');
    const notebookNameElement = dialog.element.querySelector('[data-type="notebook-name"]') as HTMLInputElement;
    dialog.bindInput(notebookNameElement, () => {
        confirmElement.dispatchEvent(new CustomEvent("click"));
    });
    cancelElement.addEventListener("click", () => {
        dialog.destroy();
    });
    confirmElement.addEventListener("click", () => {
        let name = notebookNameElement.value;
        if (!validateName(name)) {
            return false;
        }
        name = normalizeNotebookName(name);
        if (isMobile()) {
            void dialog.runPending(async () => {
                const response = await fetchSyncPost("/api/notebook/createNotebook", {name});
                return response.code === 0;
            });
            return;
        }
        fetchPost("/api/notebook/createNotebook", {
            name
        });
        dialog.destroy();
    });
    if (!getHostCapabilities().documentImportExport) {
        return;
    }
    const createNotebookForImport = (fallbackName: string, callback: (notebookID: string) => void) => {
        let name = notebookNameElement.value.trim();
        if (!name) {
            name = fallbackName;
            notebookNameElement.value = name;
        }
        if (!validateName(name)) {
            dialog.focusWhenReady(() => notebookNameElement);
            return;
        }
        if (isMobile()) {
            let notebookID: string;
            void dialog.runPending(async () => {
                const response = await fetchSyncPost("/api/notebook/createNotebook", {name: normalizeNotebookName(name)});
                notebookID = response.code === 0 ? response.data?.notebook?.id : undefined;
                return !!notebookID;
            }).then(success => {
                if (success) callback(notebookID);
            });
            return;
        }
        fetchPost("/api/notebook/createNotebook", {name: normalizeNotebookName(name)}, (response) => {
            const notebookID = response.data?.notebook?.id as string | undefined;
            if (!notebookID) {
                return;
            }
            dialog.destroy();
            callback(notebookID);
        });
    };
    const toggleImportElement = dialog.element.querySelector('[data-type="toggle-import"]') as HTMLElement;
    const importOptionsElement = dialog.element.querySelector('[data-type="import-options"]') as HTMLElement;
    const importArrowElement = toggleImportElement.querySelector('[data-type="import-arrow"]') as SVGElement;
    const toggleImportOptions = () => {
        const expanded = importOptionsElement.classList.toggle("fn__none") === false;
        toggleImportElement.setAttribute("aria-expanded", expanded.toString());
        importArrowElement.classList.toggle("b3-list-item__arrow--open", expanded);
    };
    toggleImportElement.addEventListener("click", toggleImportOptions);
    toggleImportElement.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            toggleImportOptions();
        }
    });
    dialog.element.querySelector('[data-type="import-sy"] .b3-form__upload').addEventListener("change", (event: InputEvent & {
        target: HTMLInputElement
    }) => {
        if (!event.target.files?.[0]) {
            return;
        }
        dialog.destroy();
        importNotebook(event.target.files[0]);
    });
    dialog.element.querySelector('[data-type="import-markdown-zip"] .b3-form__upload').addEventListener("change", (event: InputEvent & {
        target: HTMLInputElement
    }) => {
        const file = event.target.files?.[0];
        if (!file) {
            return;
        }
        event.target.value = "";
        createNotebookForImport(file.name.replace(/\.zip$/i, ""), (notebookID) => {
            const formData = new ContractFormData({file, notebook: notebookID, toPath: "/", skipRoot: "true"});
            fetchPost("/api/import/importZipMd", formData);
        });
    });
    /// #if !BROWSER
    if (!getHostCapabilities().localFileSystem) {
        return;
    }
    const importMarkdown = async (isFile: boolean) => {
        const localPath = await ipcRenderer.invoke(Constants.SIYUAN_GET, {
            cmd: "showOpenDialog",
            defaultPath: window.siyuan.config.system.homeDir,
            filters: isFile ? [{name: "Markdown", extensions: ["md", "markdown"]}] : [],
            properties: [isFile ? "openFile" : "openDirectory"],
        });
        if (localPath.filePaths.length === 0) {
            return;
        }
        const sourcePath = localPath.filePaths[0];
        const fallbackName = isFile ? path.basename(sourcePath, path.extname(sourcePath)) : path.basename(sourcePath);
        createNotebookForImport(fallbackName, (notebookID) => {
            fetchPost("/api/import/importStdMd", {
                notebook: notebookID,
                localPath: sourcePath,
                toPath: "/",
                skipRoot: !isFile,
            });
        });
    };
    const bindImportMarkdown = (type: string, isFile: boolean) => {
        const element = dialog.element.querySelector(`[data-type="${type}"]`) as HTMLElement;
        const selectMarkdown = (): void => {
            void importMarkdown(isFile);
        };
        element.addEventListener("click", selectMarkdown);
        element.addEventListener("keydown", (event) => {
            if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                selectMarkdown();
            }
        });
    };
    bindImportMarkdown("import-markdown-file", true);
    bindImportMarkdown("import-markdown-folder", false);
    const importObsidianElement = dialog.element.querySelector('[data-type="import-obsidian"]') as HTMLElement;
    let selectingObsidianVault = false;
    const selectObsidianVault = async () => {
        if (selectingObsidianVault) {
            return;
        }
        selectingObsidianVault = true;
        try {
            const localPath = await ipcRenderer.invoke(Constants.SIYUAN_GET, {
                cmd: "showOpenDialog",
                singleton: "obsidianVault",
                defaultPath: window.siyuan.config.system.homeDir,
                properties: ["openDirectory"],
            });
            if (localPath.filePaths.length === 0) {
                return;
            }
            dialog.destroy();
            importObsidianVault(localPath.filePaths[0]);
        } finally {
            selectingObsidianVault = false;
        }
    };
    importObsidianElement.addEventListener("click", selectObsidianVault);
    importObsidianElement.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            selectObsidianVault();
        }
    });
    /// #endif
};

let newEncryptedNotebookPending = false;

export const newEncryptedNotebook = () => {
    if (window.siyuan.dialogs.some((item) => item.element.getAttribute("data-key") === "newEncryptedNotebook")) {
        return;
    }
    if (newEncryptedNotebookPending) {
        return;
    }
    newEncryptedNotebookPending = true;
    // 先检查加密功能状态；未启用或需要恢复时提示用户前往设置页处理
    fetchPost("/api/notebook/getEncryptedNotebookStatus", {}, (response) => {
        if (response.data.state === "RecoveryRequired") {
            showMessage(window.siyuan.languages.encryptedNotebookRecoveryRequiredTip, 6000, "error");
            return;
        }
        if (response.data.state !== "Enabled") {
            showMessage(window.siyuan.languages.encryptedNotebookNotEnabledTip, 6000);
            return;
        }
        const dialog = new Dialog({
            title: window.siyuan.languages.newEncryptedNotebook,
            content: `<div class="b3-dialog__content">
    <input placeholder="${window.siyuan.languages.notebookName}" class="b3-text-field fn__block">
    <div class="fn__hr"></div>
    <input type="password" placeholder="${window.siyuan.languages.masterPassword}" class="b3-text-field fn__block">
    <div class="fn__hr--b"></div>
    <div>${window.siyuan.languages.encryptedNotebookRiskTip}</div>
</div>
<div class="b3-dialog__action">
    <button class="b3-button b3-button--cancel">${window.siyuan.languages.cancel}</button><div class="fn__space"></div>
    <button class="b3-button b3-button--text">${window.siyuan.languages.confirm}</button>
</div>`,
            width: isMobile() ? "92vw" : "520px"
        });
        dialog.element.setAttribute("data-key", "newEncryptedNotebook");
        const btnsElement = dialog.element.querySelectorAll<HTMLButtonElement>(".b3-button");
        const inputs = dialog.element.querySelectorAll("input");
        dialog.bindInput(inputs[0], () => {
            btnsElement[1].dispatchEvent(new CustomEvent("click"));
        });
        btnsElement[0].addEventListener("click", () => {
            dialog.destroy();
        });
        btnsElement[1].addEventListener("click", async () => {
            const name = inputs[0].value;
            const password = inputs[1].value;
            if (!validateName(name)) {
                return false;
            }
            if (!password) {
                showMessage(window.siyuan.languages.masterPassword);
                return false;
            }
            if (isMobile()) {
                return dialog.runPending(async () => {
                    const response = await fetchSyncPost("/api/notebook/createEncryptedNotebook", {
                        name: normalizeNotebookName(name), password,
                    });
                    return response.code === 0;
                });
            }
            btnsElement[1].disabled = true;
            const response = await fetchSyncPost("/api/notebook/createEncryptedNotebook", {
                name: normalizeNotebookName(name),
                password
            });
            if (response.code === 0) {
                // createEncryptedNotebook 内核已原子完成创建+挂载，无需再单独 openNotebook
                dialog.destroy();
            } else {
                btnsElement[1].disabled = false;
            }
        });
    }).finally(() => {
        newEncryptedNotebookPending = false;
    });
};

export const openEncryptedNotebook = (app: App, notebookId: string, name: string) => {
    const dialogKey = "encryptedNotebook-" + notebookId;
    if (window.siyuan.dialogs.some((item) => item.element.getAttribute("data-key") === dialogKey)) {
        return;
    }
    const dialog = openInputDialog({
        title: window.siyuan.languages.unlockEncryptedNotebook.replace("${x}", escapeHtml(name)),
        value: "",
        type: "password",
        placeholder: window.siyuan.languages.masterPassword,
        description: window.siyuan.languages.encryptedNotebookRiskTip,
        awaitConfirm: true,
        onConfirm: async (password, dialog) => {
            const inputElement = dialog.element.querySelector<HTMLInputElement>("[data-dialog-input]");
            const confirmElement = dialog.element.querySelector<HTMLButtonElement>("[data-input-confirm]");
            if (!password) {
                return false;
            }
            confirmElement.disabled = true;
            // 原子化解锁并挂载：UnlockBox 成功后立即 Mount，Mount 失败则后端自动 LockBox 回滚，避免 DEK 残留
            const response = await fetchSyncPost("/api/notebook/unlockAndOpenNotebook", {
                notebook: notebookId,
                password
            });
            if (response.code === 0) {
                dialog.destroy();
                return true;
            } else {
                confirmElement.disabled = false;
                inputElement.value = "";
                if (isMobile()) dialog.focusWhenReady(() => inputElement);
                else inputElement.focus();
                return false;
            }
        },
    });
    dialog.element.setAttribute("data-key", dialogKey);
};
