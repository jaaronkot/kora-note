import * as assert from "node:assert/strict";
import {execFile} from "node:child_process";
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import * as path from "node:path";
import {test} from "node:test";
import {promisify} from "node:util";
import {ModuleKind, ScriptTarget, transpileModule} from "typescript";

const {parse} = require("ifdef-loader/preprocessor");

const browserCases = async (source: string) => {
    const check: typeof assert = require("node:assert/strict");
    const requests: {notebook: string, path: string}[] = [];
    const opened: {app: unknown, id: string}[] = [];
    const responses: unknown[][] = [];
    const modules: Record<string, {exports: any}> = {};
    const externals: Record<string, unknown> = {
        constants: {Constants: {SIYUAN_APPID: "kora", CB_GET_HISTORY: "cb-get-history"}},
        "util/fetch": {fetchPost: (url: string, request: {notebook: string, path: string},
                                   callback: (response: unknown) => void) => {
            check.equal(url, "/api/filetree/listDocsByPath");
            requests.push(request);
            const files = responses.shift() || [];
            queueMicrotask(() => callback({code: 0, data: {files}}));
        }},
        "util/escape": {
            escapeAttr: (value: string) => String(value).replace(/"/g, "&quot;"),
            escapeHtml: (value: string) => String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;"),
        },
        "util/pathName": {getDocDisplayName: (name: string, titleEmpty?: boolean) => titleEmpty ? "Untitled" : name},
        "emoji/fileTreeIcon": {getFileTreeIconHTML: (icon: string, defaultIcon: string) =>
            `<span class="b3-list-item__graphic" data-icon="${defaultIcon}"></span>`},
        "protyle/ui/initUI": {setPadding: (): void => undefined},
        "editor/util": {openFileById: (options: {app: unknown, id: string, notebookId: string}) =>
            opened.push({app: options.app, id: options.id})},
        "mobile/editor": {openMobileFileById: (app: unknown, id: string) => opened.push({app, id})},
    };
    const load = (name: string): any => {
        if (name in externals) {
            return externals[name];
        }
        if (modules[name]) {
            return modules[name].exports;
        }
        check.equal(name, "protyle/render/subdocListRender", `Unexpected dependency ${name}`);
        const module = {exports: {}};
        modules[name] = module;
        new Function("require", "module", "exports", source)((dependency: string) => {
            const parts = name.split("/");
            parts.pop();
            dependency.split("/").forEach(part => {
                if (part === "..") {
                    parts.pop();
                } else if (part !== ".") {
                    parts.push(part);
                }
            });
            return load(parts.join("/"));
        }, module, module.exports);
        return module.exports;
    };
    Object.assign(window, {
        siyuan: {
            isPublish: false,
            config: {readonly: false},
            languages: new Proxy({}, {get: (_value, key) => String(key)}),
        },
    });
    const file = (id: string, name: string, extra: Record<string, unknown> = {}) => ({
        id, name, icon: "", titleEmpty: false, subFileCount: 0, ...extra,
    });
    const makeParagraph = () => {
        const block = document.createElement("div");
        block.className = "p";
        block.setAttribute("data-type", "NodeParagraph");
        block.setAttribute("data-node-id", "block");
        block.textContent = "text";
        return block;
    };
    const makeProtyle = (options: {action?: string[], backlinkData?: unknown} = {}, notebookId = "box",
                          docPath = "/parent", rootID = "parent") => {
        const contentElement = document.createElement("div");
        contentElement.className = "protyle-content";
        const root = document.createElement("div");
        root.className = "protyle-wysiwyg";
        contentElement.append(root);
        document.body.append(contentElement);
        const protyle = {
            app: {},
            lite: false,
            notebookId,
            path: docPath,
            block: {rootID},
            options: {action: options.action || [], backlinkData: options.backlinkData},
            contentElement,
            wysiwyg: {element: root},
        };
        return {protyle, root, contentElement};
    };
    const containerOf = (contentElement: HTMLElement) =>
        contentElement.querySelector<HTMLElement>(":scope > .subdoc-list-auto");
    const wait = (timeout = 80) => new Promise(resolve => setTimeout(resolve, timeout));
    const {initSubDocListRender, destroySubDocListRender, refreshSubDocList} =
        load("protyle/render/subdocListRender");

    // 打开文档前不展示也不请求，列表容器挂在正文之前。
    const {protyle, root, contentElement} = makeProtyle();
    initSubDocListRender(protyle);
    const container = containerOf(contentElement);
    check.ok(container);
    check.equal(root.previousElementSibling, container);
    check.equal(container.classList.contains("fn__none"), true);
    await wait(30);
    check.equal(requests.length, 0);

    // 整篇文档打开后自动加载子文档，自身文档被过滤。
    root.setAttribute("data-doc-type", "NodeDocument");
    root.append(makeParagraph());
    responses.push([file("parent", "Parent"), file("child-a", "Child A"), file("child-b", "Child B", {subFileCount: 2})]);
    await wait();
    check.equal(requests.length, 1);
    check.equal(requests[0].notebook, "box");
    check.equal(requests[0].path, "/parent");
    check.equal(container.classList.contains("fn__none"), false);
    const list = container.querySelector<HTMLElement>(".subdoc-list");
    check.ok(list);
    check.deepEqual(Array.from(list.querySelectorAll(".b3-list-item")).map(item => item.getAttribute("data-id")),
        ["child-a", "child-b"]);
    check.equal(list.textContent.includes("Parent"), false);
    check.equal(list.querySelector('[data-id="child-a"] .b3-list-item__text').textContent, "Child A");
    check.equal(list.querySelector('[data-id="child-b"] .b3-list-item__graphic').getAttribute("data-icon"), "folder");
    check.equal(list.querySelector('[data-id="child-a"] .b3-list-item__graphic').getAttribute("data-icon"), "file");
    check.equal(list.querySelector('[data-id="child-b"] .counter').textContent, "2");
    check.equal(list.querySelector('[data-id="child-a"] .counter'), null);

    list.querySelector<HTMLElement>('[data-id="child-a"]').click();
    await wait(0);
    check.deepEqual(opened, [{app: protyle.app, id: "child-a"}]);

    // 正文继续编辑不重复请求。
    root.append(makeParagraph());
    await wait();
    check.equal(requests.length, 1);

    // 缩放只展示块内容，不展示子文档；缩回文档后重新加载。
    root.setAttribute("data-doc-type", "NodeHeading");
    await wait();
    check.equal(container.classList.contains("fn__none"), true);
    check.equal(container.innerHTML, "");
    check.equal(requests.length, 1);
    responses.push([file("parent", "Parent"), file("child-c", "Child C")]);
    root.setAttribute("data-doc-type", "NodeDocument");
    await wait();
    check.equal(requests.length, 2);
    check.equal(container.classList.contains("fn__none"), false);
    check.deepEqual(Array.from(container.querySelectorAll(".b3-list-item")).map(item => item.getAttribute("data-id")),
        ["child-c"]);

    // 切换文档时按新路径重新请求。
    protyle.notebookId = "box2";
    protyle.path = "/other";
    protyle.block.rootID = "other";
    responses.push([file("other", "Other"), file("child-d", "Child D")]);
    root.append(makeParagraph());
    await wait();
    check.equal(requests.length, 3);
    check.equal(requests[2].notebook, "box2");
    check.equal(requests[2].path, "/other");
    check.deepEqual(Array.from(container.querySelectorAll(".b3-list-item")).map(item => item.getAttribute("data-id")),
        ["child-d"]);

    // 没有子文档时不展示列表。
    protyle.path = "/empty";
    protyle.block.rootID = "empty";
    responses.push([file("empty", "Empty")]);
    root.append(makeParagraph());
    await wait();
    check.equal(requests.length, 4);
    check.equal(container.classList.contains("fn__none"), true);

    // 目录结构变化后强制刷新同一文档的列表。
    responses.push([file("empty", "Empty"), file("child-e", "Child E")]);
    refreshSubDocList(protyle);
    await wait();
    check.equal(requests.length, 5);
    check.equal(requests[4].path, "/empty");
    check.equal(container.classList.contains("fn__none"), false);
    check.deepEqual(Array.from(container.querySelectorAll(".b3-list-item")).map(item => item.getAttribute("data-id")),
        ["child-e"]);

    // 引用面板、历史、发布和只读内核不展示子文档。
    for (const guarded of [{backlinkData: {}}, {action: ["cb-get-history"]}]) {
        const guardedProtyle = makeProtyle(guarded, "box", "/guarded", "guarded");
        initSubDocListRender(guardedProtyle.protyle);
        guardedProtyle.root.setAttribute("data-doc-type", "NodeDocument");
        guardedProtyle.root.append(makeParagraph());
        await wait(30);
        check.equal(containerOf(guardedProtyle.contentElement).classList.contains("fn__none"), true);
        destroySubDocListRender(guardedProtyle.root);
    }
    window.siyuan.config.readonly = true;
    const readonlyProtyle = makeProtyle({}, "box", "/readonly", "readonly");
    initSubDocListRender(readonlyProtyle.protyle);
    readonlyProtyle.root.setAttribute("data-doc-type", "NodeDocument");
    await wait(30);
    check.equal(containerOf(readonlyProtyle.contentElement).classList.contains("fn__none"), true);
    destroySubDocListRender(readonlyProtyle.root);
    window.siyuan.config.readonly = false;
    const requestCount = requests.length;

    // 销毁后移除容器并停止请求。
    destroySubDocListRender(root);
    check.equal(containerOf(contentElement), null);
    root.append(makeParagraph());
    await wait(30);
    check.equal(requests.length, requestCount);
    return "Sub-document list DOM cases passed";
};

for (const mobile of [false, true]) {
    test(`sub-document list auto view renders ${mobile ? "mobile" : "desktop"} titles and navigation`, {
        skip: process.platform === "linux" && !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY,
        timeout: 45000,
    }, async () => {
        const source = transpileModule(parse(readFileSync(path.join(__dirname, "subdocListRender.ts"), "utf8"),
            {MOBILE: mobile, BROWSER: true}, false, true, "subdocListRender.ts"), {
            compilerOptions: {target: ScriptTarget.ES2021, module: ModuleKind.CommonJS},
        }).outputText;
        const temporary = mkdtempSync(path.join(tmpdir(), "siyuan-subdoc-list-"));
        const script = path.join(temporary, "run.cjs");
        writeFileSync(script, `const {app, BrowserWindow} = require("electron");
app.setPath("userData", ${JSON.stringify(path.join(temporary, "profile"))});
app.commandLine.appendSwitch("disable-gpu");
app.whenReady().then(async () => {
    const win = new BrowserWindow({show: false, width: 800, height: 600, webPreferences: {nodeIntegration: true,
        contextIsolation: false, offscreen: true, backgroundThrottling: false}});
    try {
        await win.loadURL("about:blank");
        console.log(await win.webContents.executeJavaScript(${JSON.stringify(
        `const __name = value => value; (${browserCases.toString()})(${JSON.stringify(source)})`)}));
        win.destroy(); app.exit(0);
    } catch (error) { console.error(error); win.destroy(); app.exit(1); }
});`, "utf8");
        const env: NodeJS.ProcessEnv = {...process.env, XDG_CACHE_HOME: path.join(temporary, "cache")};
        delete env.ELECTRON_RUN_AS_NODE;
        const args = process.platform === "linux" && !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY ?
            ["--ozone-platform=headless", script] : [script];
        try {
            const result = await promisify(execFile)(require("electron") as unknown as string, args,
                {env, timeout: 40000, windowsHide: true});
            assert.match(result.stdout, /Sub-document list DOM cases passed/);
        } finally {
            assert.equal(path.dirname(path.resolve(temporary)), path.resolve(tmpdir()));
            assert.ok(path.basename(temporary).startsWith("siyuan-subdoc-list-"));
            rmSync(temporary, {recursive: true, force: true});
        }
    });
}
