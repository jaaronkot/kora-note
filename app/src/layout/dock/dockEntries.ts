// 书签入口按目录定义固定在左侧停靠栏下组，并使用星标图标。
export const DOCK_BOOKMARK_ICON = "iconStar";

// 停靠入口的图标统一在此校正，历史布局里残留的旧图标在加载时会被覆盖。
export const normalizeDockItemIcon = (item: Config.IUILayoutDockTab) => {
    if (item.type === "bookmark") {
        item.icon = DOCK_BOOKMARK_ICON;
    }
};

// 已保存布局里若把书签入口留在右侧或底部，这里将其归位到左侧的标签入口上方。
export const moveBookmarkToLeftDock = (layout: Pick<Config.IUiLayout, "left" | "right" | "bottom">) => {
    const left = layout.left;
    if (!left) {
        return;
    }
    const leftGroups = left.data || (left.data = []);
    if (leftGroups.some((group) => group?.some((item) => item.type === "bookmark"))) {
        return;
    }
    let bookmark: Config.IUILayoutDockTab | undefined;
    for (const key of ["right", "bottom"] as const) {
        for (const group of layout[key]?.data || []) {
            const index = group?.findIndex((item) => item.type === "bookmark") ?? -1;
            if (index > -1) {
                bookmark = group.splice(index, 1)[0];
                break;
            }
        }
        if (bookmark) {
            break;
        }
    }
    if (!bookmark) {
        return;
    }
    let targetGroup = leftGroups.find((group) => group?.some((item) => item.type === "tag"));
    if (!targetGroup) {
        targetGroup = leftGroups[1] || (leftGroups[1] = []);
    }
    const tagIndex = targetGroup.findIndex((item) => item.type === "tag");
    targetGroup.splice(tagIndex > -1 ? tagIndex : targetGroup.length, 0, bookmark);
};

// 全局关系图入口已下线，已保存布局里残留的条目一并清除。
export const removeGlobalGraphDock = (layout: Pick<Config.IUiLayout, "left" | "right" | "bottom">) => {
    for (const key of ["left", "right", "bottom"] as const) {
        for (const group of layout[key]?.data || []) {
            for (let index = group.length - 1; index >= 0; index--) {
                if (group[index]?.type === "globalGraph") {
                    group.splice(index, 1);
                }
            }
        }
    }
};

// 大纲、关系图与反向链接的入口从右侧停靠栏移到左侧，图标排在文件树入口之后。
const LEFT_DOCK_ENTRY_TYPES = ["outline", "graph", "backlink"];

export const moveDockEntriesToLeftDock = (layout: Pick<Config.IUiLayout, "left" | "right" | "bottom">) => {
    const left = layout.left;
    if (!left) {
        return;
    }
    const leftGroups = left.data || (left.data = []);
    const targetGroup = leftGroups[0] || (leftGroups[0] = []);
    const entries: Config.IUILayoutDockTab[] = [];
    for (const key of ["left", "right", "bottom"] as const) {
        for (const group of layout[key]?.data || []) {
            for (let index = group.length - 1; index >= 0; index--) {
                if (LEFT_DOCK_ENTRY_TYPES.includes(group[index]?.type)) {
                    entries.unshift(group.splice(index, 1)[0]);
                }
            }
        }
    }
    if (entries.length === 0) {
        return;
    }
    entries.sort((first, second) =>
        LEFT_DOCK_ENTRY_TYPES.indexOf(first.type) - LEFT_DOCK_ENTRY_TYPES.indexOf(second.type));
    const fileIndex = targetGroup.findIndex((item) => item.type === "file");
    targetGroup.splice(fileIndex > -1 ? fileIndex + 1 : targetGroup.length, 0, ...entries);
};

// 右侧停靠栏的图标列不再展示，入口改到顶栏；面板仍挂在右侧停靠区域。
export const hideRightDockBar = () => {
    const rightDock = document.getElementById("dockRight");
    if (rightDock) {
        rightDock.style.display = "none";
    }
};
