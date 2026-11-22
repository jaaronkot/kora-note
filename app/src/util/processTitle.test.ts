import * as assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {test} from "node:test";
import {runInNewContext} from "node:vm";
import {ModuleKind, ScriptTarget, transpileModule} from "typescript";

const compiled = transpileModule(readFileSync("src/util/processTitle.ts", "utf8"), {
    compilerOptions: {module: ModuleKind.CommonJS, target: ScriptTarget.ES2021},
}).outputText;

class ElementStub {
    public className = "";
    public textContent = "";
    public innerHTML = "";
    public attributes: Record<string, string> = {};
    public childNodes: unknown[] = [];
    public children: unknown[] = [];

    public append(...nodes: unknown[]) {
        this.children.push(...nodes);
    }

    public appendChild(node: unknown) {
        this.children.push(node);
        return node;
    }

    public setAttribute(name: string, value: string) {
        this.attributes[name] = value;
    }

    public getAttribute(name: string) {
        return this.attributes[name];
    }

    public replaceChildren(...nodes: unknown[]) {
        this.children = nodes;
        this.childNodes = nodes;
    }
}

const fixture = (options: {brand?: string, hideToolbar?: boolean, workspaceDir?: string, focusedTabTitle?: string} = {}) => {
    const drag = new ElementStub();
    const tabText = new ElementStub();
    tabText.textContent = options.focusedTabTitle ?? "";
    const tabHeader = {
        querySelector: (selector: string) => (selector === ".item__text" ? tabText : null),
    };
    const documentStub = {
        title: "",
        getElementById: (id: string) => (id === "drag" ? drag : null),
        createElement: () => new ElementStub(),
        querySelector: () => (options.focusedTabTitle === undefined ? null : tabHeader),
    };
    const languages: Record<string, unknown> = {"_kernel": {16: "未命名文档"}};
    if (options.brand !== undefined) {
        languages.siyuanNote = options.brand;
    }
    const exports: any = {};
    runInNewContext(compiled, {
        exports,
        document: documentStub,
        window: {
            siyuan: {
                languages,
                config: {
                    system: {workspaceDir: options.workspaceDir ?? "/Users/test/SiYuan"},
                    appearance: {hideToolbar: options.hideToolbar ?? false},
                },
            },
        },
        require: (name: string) => {
            if (name === "./escape") return {escapeHtml: (value: string) => value};
            if (name === "./pathName") return {
                pathPosix: () => ({basename: (path: string) => path.split("/").pop() ?? ""}),
            };
            throw new Error(name);
        },
    });
    return {setTitle: exports.setTitle as (title: string, showBrandTitle?: boolean, icon?: unknown) => void,
        syncTitleFromFocusedTab: exports.syncTitleFromFocusedTab as () => void,
        setWindowWorkspaceTitle: exports.setWindowWorkspaceTitle as (name: string) => void,
        drag, documentStub};
};

test("the top bar shows the brand alone when no document is focused", () => {
    const state = fixture();
    state.setTitle("", true);
    assert.equal(state.documentStub.title, "Kora Note");
    assert.equal(state.drag.textContent, "Kora Note");
    assert.equal(state.drag.getAttribute("title"), "Kora Note");
});

test("the top bar shows the document title with the brand and drops the workspace name and version", () => {
    const state = fixture();
    state.setTitle("我的文档", false);
    assert.equal(state.documentStub.title, "我的文档 - Kora Note");
    assert.equal(state.drag.innerHTML, "我的文档 - Kora Note");
    assert.equal(state.drag.getAttribute("title"), "我的文档 - Kora Note");
    assert.doesNotMatch(state.documentStub.title, /SiYuan|v\d/);
});

test("an empty document title falls back to the unnamed document label", () => {
    const state = fixture();
    state.setTitle("   ", false);
    assert.equal(state.documentStub.title, "未命名文档 - Kora Note");
});

test("the brand falls back to Kora Note when the language pack has no product name", () => {
    const state = fixture({brand: ""});
    state.setTitle("", true);
    assert.equal(state.documentStub.title, "Kora Note");
});

test("a separate workspace window keeps its own prefix in front of the brand", () => {
    const state = fixture();
    state.setWindowWorkspaceTitle("另一个工作空间");
    state.setTitle("", true);
    assert.equal(state.documentStub.title, "另一个工作空间 - Kora Note");
});

test("the hidden toolbar leaves the drag bar untouched but still updates the window title", () => {
    const state = fixture({hideToolbar: true});
    state.setTitle("我的文档", false);
    assert.equal(state.documentStub.title, "我的文档 - Kora Note");
    assert.equal(state.drag.textContent, "");
    assert.equal(state.drag.innerHTML, "");
});

test("the startup sync keeps the restored document title instead of the bare brand", () => {
    const state = fixture({focusedTabTitle: "我的文档"});
    state.syncTitleFromFocusedTab();
    assert.equal(state.documentStub.title, "我的文档 - Kora Note");
    assert.equal(state.drag.innerHTML, "我的文档 - Kora Note");
});

test("the startup sync falls back to the brand alone when no document tab is focused", () => {
    const state = fixture();
    state.syncTitleFromFocusedTab();
    assert.equal(state.documentStub.title, "Kora Note");
    assert.equal(state.drag.textContent, "Kora Note");
});
