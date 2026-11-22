import * as assert from "node:assert/strict";
import {test} from "node:test";
import {getKeymapBindings, getKeymapItem, IShortcutKeymap} from "./keymapBindings";
import {buildKeymapMigrations, migrateKeymapDefaults} from "./keymapMigration";

// constants.ts 依赖构建期注入的版本常量，测试环境补齐后再载入。
Object.assign(globalThis, {SIYUAN_VERSION: "test", NODE_ENV: "test"});
const {Constants} = require("../constants") as typeof import("../constants");

const cloneKeymap = (): Config.IKeymap => JSON.parse(JSON.stringify(Constants.SIYUAN_KEYMAP));

// 模拟仍使用旧默认键位的既有工作区。
const buildLegacyKeymap = (platform: string): Config.IKeymap => {
    const keymap = cloneKeymap();
    buildKeymapMigrations(platform).forEach(({path, from}) => {
        const item = getKeymapItem(keymap, path);
        if (!item) {
            return;
        }
        item.default = from[0] || "";
        item.custom = from[0] || "";
        delete item.bindings;
    });
    return keymap;
};

const collectDefaultHotkeys = (keymap: Config.IKeymap): Array<[string, string]> => {
    const entries: Array<[string, string]> = [];
    const walk = (value: unknown, path: string[]) => {
        if (!value || typeof value !== "object") {
            return;
        }
        const item = value as IShortcutKeymap;
        if (typeof item.custom === "string") {
            if (item.default) {
                entries.push([path.join("."), item.default]);
            }
            return;
        }
        Object.entries(value).forEach(([key, child]) => walk(child, [...path, key]));
    };
    walk(keymap, []);
    return entries;
};

test("旧默认键位迁移为新默认值", () => {
    for (const platform of ["darwin", "win32"]) {
        const keymap = buildLegacyKeymap(platform);
        assert.equal(migrateKeymapDefaults(keymap, platform), true);
        buildKeymapMigrations(platform).forEach(({path, to}) => {
            const item = getKeymapItem(keymap, path);
            assert.deepEqual(getKeymapBindings(item), to, path.join("."));
        });
    }
});

test("迁移只覆盖旧默认值且可重复执行", () => {
    const keymap = buildLegacyKeymap("darwin");
    assert.equal(migrateKeymapDefaults(keymap, "darwin"), true);
    assert.equal(migrateKeymapDefaults(keymap, "darwin"), false);
});

test("面板编号的中间版本同样迁移到最终顺序", () => {
    const keymap = buildLegacyKeymap("darwin");
    // 上一版曾把关系图与反向链接排在收藏、标签之后。
    const graph = getKeymapItem(keymap, ["general", "graphView"]);
    const backlink = getKeymapItem(keymap, ["general", "backlinks"]);
    assert.ok(graph && backlink);
    graph.custom = "⌃5";
    graph.default = "⌃5";
    backlink.custom = "⌃6";
    backlink.default = "⌃6";
    assert.equal(migrateKeymapDefaults(keymap, "darwin"), true);
    assert.deepEqual(getKeymapBindings(getKeymapItem(keymap, ["general", "graphView"])), ["⌃3"]);
    assert.deepEqual(getKeymapBindings(getKeymapItem(keymap, ["general", "backlinks"])), ["⌃4"]);
    assert.deepEqual(getKeymapBindings(getKeymapItem(keymap, ["general", "bookmark"])), ["⌃5"]);
    assert.deepEqual(getKeymapBindings(getKeymapItem(keymap, ["general", "tag"])), ["⌃6"]);
});

test("用户自定义过的绑定保持不变", () => {
    const keymap = buildLegacyKeymap("darwin");
    const config = getKeymapItem(keymap, ["general", "config"]);
    assert.ok(config);
    config.custom = "⌥X";
    assert.equal(migrateKeymapDefaults(keymap, "darwin"), true);
    assert.deepEqual(getKeymapBindings(getKeymapItem(keymap, ["general", "config"])), ["⌥X"]);
});

test("默认键位互不冲突", () => {
    const seen = new Map<string, string>();
    collectDefaultHotkeys(cloneKeymap()).forEach(([path, hotkey]) => {
        const owner = seen.get(hotkey);
        assert.equal(owner, undefined, `${path} 与 ${owner} 使用相同键位 ${hotkey}`);
        seen.set(hotkey, path);
    });
});

test("默认键位不再占用 macOS 原生菜单键位", () => {
    const hotkeys = collectDefaultHotkeys(cloneKeymap()).map(([, hotkey]) => hotkey);
    // 隐藏应用、最小化、打开文件、新标签页和查找下一个均由系统或浏览器占用。
    ["⌘H", "⌘M", "⌘O", "⌘T", "⌘G"].forEach(hotkey => {
        assert.equal(hotkeys.includes(hotkey), false, hotkey);
    });
});
