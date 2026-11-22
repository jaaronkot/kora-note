import * as assert from "node:assert/strict";
import test from "node:test";
import {
    DOCK_BOOKMARK_ICON,
    hideRightDockBar,
    moveBookmarkToLeftDock,
    moveDockEntriesToLeftDock,
    normalizeDockItemIcon,
    removeGlobalGraphDock,
} from "./dockEntries";

const createDockTab = (type: string, icon?: string): Config.IUILayoutDockTab => ({
    type,
    icon,
    size: {width: 232, height: 0},
    show: false,
});

test("bookmark dock entry moves from the right dock to above the tag entry", () => {
    const layout = {
        left: {data: [[createDockTab("file")], [createDockTab("tag")]]},
        right: {data: [[createDockTab("outline"), createDockTab("bookmark", "iconBookmark")], []]},
    };

    moveBookmarkToLeftDock(layout);

    assert.deepEqual(layout.left.data[1].map((item) => item.type), ["bookmark", "tag"]);
    assert.deepEqual(layout.right.data[0].map((item) => item.type), ["outline"]);
});

test("bookmark dock entry is kept when it already sits in the left dock", () => {
    const layout = {
        left: {data: [[createDockTab("file")], [createDockTab("bookmark"), createDockTab("tag")]]},
        right: {data: [[createDockTab("outline")], []]},
    };

    moveBookmarkToLeftDock(layout);

    assert.deepEqual(layout.left.data[1].map((item) => item.type), ["bookmark", "tag"]);
});

test("bookmark dock entry falls back to the left bottom group without a tag entry", () => {
    const layout = {
        left: {data: [[createDockTab("file")]]},
        right: {data: [[createDockTab("bookmark")], []]},
    };

    moveBookmarkToLeftDock(layout);

    assert.deepEqual(layout.left.data[1].map((item) => item.type), ["bookmark"]);
    assert.deepEqual(layout.right.data[0].map((item) => item.type), []);
});

test("bookmark dock entry uses the star icon", () => {
    const bookmark = createDockTab("bookmark", "iconBookmark");
    normalizeDockItemIcon(bookmark);
    assert.equal(bookmark.icon, DOCK_BOOKMARK_ICON);

    const tag = createDockTab("tag", "iconTag");
    normalizeDockItemIcon(tag);
    assert.equal(tag.icon, "iconTag");
});

test("outline, graph and backlink entries move to the left dock below the file tree", () => {
    const layout = {
        left: {data: [[createDockTab("file")], [createDockTab("bookmark"), createDockTab("tag")]]},
        right: {data: [[createDockTab("outline"), createDockTab("graph")], [createDockTab("backlink")]]},
        bottom: {},
    };

    moveDockEntriesToLeftDock(layout);

    assert.deepEqual(layout.left.data[0].map((item) => item.type), ["file", "outline", "graph", "backlink"]);
    assert.deepEqual(layout.left.data[1].map((item) => item.type), ["bookmark", "tag"]);
    assert.deepEqual(layout.right.data[0], []);
    assert.deepEqual(layout.right.data[1], []);
});

test("left dock entry move keeps a single stable order on repeated runs", () => {
    const layout = {
        left: {data: [[createDockTab("file")], []]},
        right: {data: [[createDockTab("outline"), createDockTab("graph"), createDockTab("backlink")], []]},
        bottom: {},
    };

    moveDockEntriesToLeftDock(layout);
    moveDockEntriesToLeftDock(layout);

    assert.deepEqual(layout.left.data[0].map((item) => item.type), ["file", "outline", "graph", "backlink"]);
});

test("global graph dock entry is dropped from every side", () => {
    const layout = {
        left: {data: [[createDockTab("file")], []]},
        right: {data: [[createDockTab("outline"), createDockTab("globalGraph")], [createDockTab("backlink")]]},
        bottom: {data: [[createDockTab("globalGraph")]]},
    };

    removeGlobalGraphDock(layout);

    assert.deepEqual(layout.left.data[0].map((item) => item.type), ["file"]);
    assert.deepEqual(layout.right.data[0].map((item) => item.type), ["outline"]);
    assert.deepEqual(layout.right.data[1].map((item) => item.type), ["backlink"]);
    assert.deepEqual(layout.bottom.data[0], []);
});

test("right dock bar is hidden while its panel area stays available", () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, "document");
    const rightDock = {style: {display: ""}};
    Object.defineProperty(globalThis, "document", {
        configurable: true,
        value: {getElementById: (id: string) => (id === "dockRight" ? rightDock : null)},
    });
    try {
        hideRightDockBar();
        assert.equal(rightDock.style.display, "none");
    } finally {
        if (descriptor) {
            Object.defineProperty(globalThis, "document", descriptor);
        } else {
            Reflect.deleteProperty(globalThis, "document");
        }
    }
});
