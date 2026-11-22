import * as assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {test} from "node:test";
import {runInNewContext} from "node:vm";
import {ModuleKind, ScriptTarget, transpileModule} from "typescript";
import {escapeHtml} from "../../util/escape";

const createTooltip = () => {
    const api = {} as typeof import("./imageTooltip");
    runInNewContext(transpileModule(readFileSync("src/protyle/render/imageTooltip.ts", "utf8"), {
        compilerOptions: {module: ModuleKind.CommonJS, target: ScriptTarget.ES2021},
    }).outputText, {exports: api, window: {siyuan: {config: {}}},
    require: () => ({escapeHtml, getImageTitle: () => "", getAssetName: () => "image", getAssetExtension: () => ".png"})});
    const image = {getAttribute: () => "assets/image.png", alt: "", naturalWidth: 100, naturalHeight: 50} as unknown as HTMLImageElement;
    return {get: (size?: string) => api.getImageTooltip(image, size)};
};

test("image tooltip renders the file name, format and original dimensions", () => {
    const tip = createTooltip();
    assert.equal(tip.get("1 KiB"), "image.png<br>PNG · 100 × 50 · 1 KiB");
});

test("image tooltip omits the size segment when the size is unknown", () => {
    const tip = createTooltip();
    assert.equal(tip.get(), "image.png<br>PNG · 100 × 50");
});
