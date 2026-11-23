import {Constants} from "../../constants";
import {fetchPost} from "../../util/fetch";
import {escapeAttr} from "../../util/escape";
import {getDocDisplayName} from "../../util/pathName";
import {getFileTreeIconHTML} from "../../emoji/fileTreeIcon";
import {setPadding} from "../ui/initUI";

// 子文档列表是正文顶部的只读视图：由文档目录结构生成，不写入正文块数据。
const CONTAINER_CLASS = "subdoc-list-auto";

type SubDocListState = {
    protyle: IProtyle;
    element: HTMLElement;
    observer: MutationObserver;
    key: string;
    requestId: number;
};

const states = new WeakMap<HTMLElement, SubDocListState>();

// 只有以整篇文档打开的可编辑编辑器展示子文档；缩放、历史、引用、发布和只读内核均不展示。
const canShow = (protyle: IProtyle) => {
    const wysiwygElement = protyle.wysiwyg?.element;
    return !!wysiwygElement && wysiwygElement.getAttribute("data-doc-type") === "NodeDocument" &&
        !protyle.lite && !protyle.options.backlinkData &&
        !protyle.options.action.includes(Constants.CB_GET_HISTORY) &&
        !window.siyuan.isPublish && !window.siyuan.config.readonly;
};

const genListHTML = (files: IFile[]) => {
    const items = files.map((file) => {
        const defaultIcon = file.subFileCount === 0 ? "file" : "folder";
        return `<li class="b3-list-item" data-id="${escapeAttr(file.id)}">
${getFileTreeIconHTML(file.icon, defaultIcon, "b3-list-item__graphic", true)}
<span class="b3-list-item__text">${getDocDisplayName(file.name, file.titleEmpty, true)}</span>
${file.subFileCount > 0 ? `<span class="counter counter--right">${file.subFileCount}</span>` : ""}
</li>`;
    });
    return `<ul class="b3-list b3-list--background subdoc-list">${items.join("")}</ul>`;
};

const bindClick = (element: HTMLElement, protyle: IProtyle) => {
    element.addEventListener("click", (event: MouseEvent) => {
        const target = event.target as HTMLElement;
        const item = target.closest<HTMLElement>(".subdoc-list .b3-list-item");
        const id = item?.getAttribute("data-id");
        if (!id) {
            return;
        }
        event.preventDefault();
        event.stopPropagation();
        // 动态引入避免渲染模块与编辑器布局模块之间形成循环依赖。
        /// #if MOBILE
        import("../../mobile/editor").then(({openMobileFileById}) => {
            openMobileFileById(protyle.app, id, undefined, undefined, protyle.notebookId);
        });
        /// #else
        import("../../editor/util").then(({openFileById}) => {
            openFileById({app: protyle.app, id, notebookId: protyle.notebookId});
        });
        /// #endif
    });
};

const collapse = (state: SubDocListState) => {
    if (state.element.classList.contains("fn__none") && !state.element.innerHTML) {
        return;
    }
    state.element.classList.add("fn__none");
    state.element.innerHTML = "";
    setPadding(state.protyle);
};

const show = (state: SubDocListState, files: IFile[]) => {
    state.element.innerHTML = genListHTML(files);
    state.element.classList.remove("fn__none");
    setPadding(state.protyle);
};

const reset = (state: SubDocListState) => {
    state.key = "";
    state.requestId++;
    collapse(state);
};

const load = (state: SubDocListState, key: string) => {
    const {protyle} = state;
    const requestId = ++state.requestId;
    state.key = key;
    fetchPost("/api/filetree/listDocsByPath", {
        notebook: protyle.notebookId,
        path: protyle.path,
        flashcard: false,
        ignoreMaxListHint: true,
        app: Constants.SIYUAN_APPID,
    }, (response) => {
        if (state.requestId !== requestId || states.get(protyle.wysiwyg.element) !== state) {
            return;
        }
        if (response.code !== 0 || !Array.isArray(response.data?.files)) {
            collapse(state);
            return;
        }
        const files = (response.data.files as IFile[]).filter((file) => file.id !== protyle.block.rootID);
        if (files.length === 0) {
            collapse(state);
            return;
        }
        show(state, files);
    });
};

const render = (state: SubDocListState) => {
    const {protyle} = state;
    if (!protyle.contentElement?.isConnected || !protyle.wysiwyg?.element.isConnected) {
        return;
    }
    if (!state.element.isConnected) {
        protyle.wysiwyg.element.before(state.element);
        setPadding(protyle);
    }
    if (!canShow(protyle) || !protyle.notebookId || !protyle.path || !protyle.block.rootID) {
        reset(state);
        return;
    }
    const key = `${protyle.notebookId}:${protyle.block.rootID}:${protyle.path}`;
    if (state.key === key) {
        return;
    }
    // 切换文档时先清空上一份列表，避免等待请求期间显示过期内容。
    collapse(state);
    load(state, key);
};

export const refreshSubDocList = (protyle: IProtyle) => {
    const root = protyle.wysiwyg?.element;
    const state = root ? states.get(root) : undefined;
    if (!state) {
        return;
    }
    state.key = "";
    render(state);
};

export const initSubDocListRender = (protyle: IProtyle) => {
    const root = protyle.wysiwyg?.element;
    if (!root || states.has(root)) {
        return;
    }
    const element = document.createElement("div");
    element.className = `${CONTAINER_CLASS} fn__none`;
    bindClick(element, protyle);
    let frame = 0;
    const observer = new MutationObserver(() => {
        if (!frame) {
            frame = requestAnimationFrame(() => {
                frame = 0;
                const current = states.get(root);
                if (current?.observer === observer) {
                    render(current);
                }
            });
        }
    });
    // 文档切换与缩放只更新 data-doc-type 和内容，需要同时观察属性与子节点。
    observer.observe(root, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["data-doc-type"],
    });
    const state: SubDocListState = {protyle, element, observer, key: "", requestId: 0};
    states.set(root, state);
    render(state);
};

export const destroySubDocListRender = (root: HTMLElement) => {
    const state = states.get(root);
    if (!state) {
        return;
    }
    state.observer.disconnect();
    state.requestId++;
    states.delete(root);
    // 销毁阶段预览等依赖已释放，不再重算编辑器边距。
    state.element.remove();
};
