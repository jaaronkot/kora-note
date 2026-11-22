import {getKeymapBindings, getKeymapItem, setKeymapBindings} from "./keymapBindings";
import {createDockKeymapDefaults} from "./dockKeymap";

export interface IKeymapMigration {
    path: string[];
    from: string[];
    to: string[];
}

// 默认键位调整后仍使用旧默认值的用户跟随新默认值，已经自定义过的用户保留自己的绑定。
export const buildKeymapMigrations = (platform: string): IKeymapMigration[] => {
    const legacyDock = ["darwin", "ios"].includes(platform) ? "⌃" : "⌥";
    const dock = createDockKeymapDefaults(platform);
    return [
        {path: ["general", "config"], from: ["⌥P"], to: ["⌘,"]},
        {path: ["general", "commandPanel"], from: ["⌥⇧P"], to: ["⇧⌘P"]},
        {path: ["general", "mainMenu"], from: ["⌥\\"], to: ["⌘\\"]},
        {path: ["general", "recentDocs"], from: ["⌘E"], to: ["⌘R"]},
        {path: ["general", "replace"], from: ["⌘R"], to: ["⌥⌘F"]},
        {path: ["general", "editReadonly"], from: ["⇧⌘G"], to: ["⌥⌘R"]},
        // 面板编号先后调整过两次，这里同时接受两种历史编号。
        {path: ["general", "graphView"], from: [legacyDock + "8", legacyDock + "5"], to: [dock.graphView.custom]},
        {path: ["general", "backlinks"], from: [legacyDock + "7", legacyDock + "6"], to: [dock.backlinks.custom]},
        {path: ["general", "bookmark"], from: [legacyDock + "3"], to: [dock.bookmark.custom]},
        {path: ["general", "tag"], from: [legacyDock + "4"], to: [dock.tag.custom]},
        {path: ["editor", "general", "copyHPath"], from: ["⇧⌘P"], to: ["⌥⌘P"]},
        {path: ["editor", "general", "copyProtocol"], from: ["⇧⌘H"], to: ["⌘L"]},
        {path: ["editor", "general", "editMode"], from: ["⌥⌘9"], to: ["⌥⌘E"]},
        {path: ["editor", "general", "foldRecursive"], from: ["⌥⌘↑"], to: ["⌥⌘C"]},
        {path: ["editor", "insert", "sup"], from: ["⌘H"], to: ["⌥⌘U"]},
        {path: ["editor", "insert", "sub"], from: ["⌘J"], to: ["⌥⌘D"]},
        {path: ["editor", "insert", "inline-math"], from: ["⌘M"], to: ["⌥⌘Q"]},
        {path: ["editor", "insert", "inline-code"], from: ["⌘G"], to: ["⌘E"]},
        {path: ["editor", "insert", "tag"], from: ["⌘T"], to: ["⌥⌘T"]},
        {path: ["editor", "insert", "table"], from: ["⌘O"], to: ["⌥⌘S"]},
        {path: ["editor", "insert", "clearInline"], from: ["⌘\\"], to: ["⌥⌘\\"]},
        {path: ["editor", "insert", "check"], from: ["⌘L"], to: ["⌥⌘9"]},
        {path: ["editor", "insert", "list"], from: [""], to: ["⌥⌘7"]},
        {path: ["editor", "insert", "ordered-list"], from: [""], to: ["⌥⌘8"]},
        {path: ["editor", "table", "moveToUp"], from: ["⌥⌘T"], to: ["⌥⌘↑"]},
        {path: ["editor", "table", "moveToDown"], from: ["⌥⌘B"], to: ["⌥⌘↓"]},
        {path: ["editor", "table", "moveToLeft"], from: ["⌥⌘L"], to: ["⌥⌘←"]},
        {path: ["editor", "table", "moveToRight"], from: ["⌥⌘R"], to: ["⌥⌘→"]},
    ];
};

// 迁移只覆盖仍等于旧默认值的绑定，用户自定义过的键位保持不变。
export const migrateKeymapDefaults = (keymap: Config.IKeymap, platform: string): boolean => {
    let changed = false;
    buildKeymapMigrations(platform).forEach(({path, from, to}) => {
        const item = getKeymapItem(keymap, path);
        if (!item || (item.bindings && item.bindings.version !== 1)) {
            return;
        }
        const current = getKeymapBindings(item);
        // 未绑定视为空值，与旧默认值中的空字符串对应。
        const legacyValue = current.length === 0 ? "" : (current.length === 1 ? current[0] : undefined);
        if (legacyValue === undefined || !from.includes(legacyValue)) {
            return;
        }
        setKeymapBindings(item, to);
        item.default = to[0];
        changed = true;
    });
    return changed;
};
