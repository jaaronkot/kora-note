import * as assert from "node:assert/strict";
import {test} from "node:test";
import {createDeclaredMenu, declaredMenuCatalog, type IMenuDeclaration} from "./menuDeclaration";

const installLanguages = (t: {after: (callback: () => void) => void}) => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
    Object.defineProperty(globalThis, "window", {configurable: true, value: {
        siyuan: {languages: new Proxy({}, {get: (_target, key) => String(key)})},
    }});
    t.after(() => {
        if (descriptor) {
            Object.defineProperty(globalThis, "window", descriptor);
        } else {
            Reflect.deleteProperty(globalThis, "window");
        }
    });
};

interface ITestMenuContext {
    available: boolean;
    run: () => void;
}

// 声明式菜单只提供结构与标识，运行期行为由上下文决定。
const TEST_MENU: IMenuDeclaration<ITestMenuContext> = {
    id: "test",
    label: () => "testMenu",
    simple: false,
    type: "entry",
    icon: "iconTest",
    behavior: (context) => ({ignore: !context.available}),
    children: [
        {id: "first", label: () => "firstItem", simple: false, type: "entry", icon: "iconEdit"},
        {id: "separator", label: () => "", simple: true, type: "separator"},
        {
            id: "second", label: () => "secondItem", simple: false, type: "entry",
            behavior: (context) => ({click: () => context.run()}),
        },
    ],
};

test("declaration drives menu order, icons and separators", t => {
    installLanguages(t);
    const menu = createDeclaredMenu(TEST_MENU, {available: true, run: () => {}});
    assert.equal(menu.id, "test");
    assert.equal(menu.label, "testMenu");
    assert.equal(menu.icon, "iconTest");
    assert.equal(menu.type, undefined);
    assert.deepEqual(menu.submenu.map(item => [item.id, item.label, item.icon, item.type]), [
        ["first", "firstItem", "iconEdit", undefined],
        ["separator", "", undefined, "separator"],
        ["second", "secondItem", undefined, undefined],
    ]);
});

test("conditional availability does not change configurable identities", t => {
    installLanguages(t);
    for (const available of [false, true]) {
        const menu = createDeclaredMenu(TEST_MENU, {available, run: () => {}});
        assert.equal(menu.ignore, !available);
        assert.deepEqual(menu.submenu.map(item => item.id), declaredMenuCatalog(TEST_MENU).children?.map(item => item.key));
    }
});

test("catalog mirrors the declared structure without runtime behavior", t => {
    installLanguages(t);
    const catalog = declaredMenuCatalog(TEST_MENU);
    assert.equal(catalog.key, "test");
    assert.equal(catalog.simple, false);
    assert.equal(catalog.type, "entry");
    assert.deepEqual(catalog.children?.map(item => item.key), ["first", "separator", "second"]);
    assert.deepEqual(catalog.children?.map(item => item.simple), [false, true, false]);
    assert.deepEqual(catalog.children?.map(item => item.label()), ["firstItem", "", "secondItem"]);
});

test("declared actions run the context behavior", t => {
    installLanguages(t);
    const clicked: string[] = [];
    const menu = createDeclaredMenu(TEST_MENU, {available: true, run: () => { clicked.push("run"); }});
    menu.submenu[2].click?.(undefined, undefined);
    assert.deepEqual(clicked, ["run"]);
});
