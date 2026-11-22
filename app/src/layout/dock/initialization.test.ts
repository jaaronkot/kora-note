import * as assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {join} from "node:path";
import {test} from "node:test";
import {transpileModule, ScriptTarget} from "typescript";
import {normalizeDockItemIcon} from "./dockEntries";

test("publishing removes unavailable docks without skipping adjacent titles", () => {
    const source = readFileSync(join(__dirname, "../util.ts"), "utf8");
    const start = source.indexOf("const initInternalDock =");
    const end = source.indexOf("const JSONToDock =", start);
    const compiled = transpileModule(source.slice(start, end), {
        compilerOptions: {target: ScriptTarget.ES2020},
    }).outputText;
    const languages = {graphView: "Graph View", bookmark: "Bookmarks"};
    const init = new Function("window", "normalizeDockItemIcon", compiled + "return initInternalDock;")(
        {siyuan: {languages}}, normalizeDockItemIcon);
    const docks = [
        {type: "agentChat", hotkeyLangId: "agentChat"},
        {type: "graph", hotkeyLangId: "graphView"},
        {type: "bookmark", hotkeyLangId: "bookmark"},
    ];
    init(docks);
    assert.deepEqual(docks.map(item => item.type), ["graph", "bookmark"]);
    assert.deepEqual(docks.map(item => (item as {title?: string}).title), Object.values(languages));
});
