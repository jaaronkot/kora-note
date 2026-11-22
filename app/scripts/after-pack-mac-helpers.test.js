const {test} = require("node:test");
const assert = require("node:assert/strict");
const {execFileSync} = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {afterPack} = require("./after-pack-mac-helpers");

const macOSOnly = {skip: "darwin" !== process.platform ? "macOS only" : false};

const plistValue = (plistPath, key) => execFileSync("plutil", ["-extract", key, "raw", "-o", "-", plistPath]).toString().trim();

// 构造一个与 electron-builder 输出一致的 Helper 结构。
const createHelperBundle = (frameworks, name) => {
    const helperDir = path.join(frameworks, `${name}.app`);
    const macOSDir = path.join(helperDir, "Contents", "MacOS");
    fs.mkdirSync(macOSDir, {recursive: true});
    fs.writeFileSync(path.join(macOSDir, name), "");
    const plistPath = path.join(helperDir, "Contents", "Info.plist");
    execFileSync("plutil", ["-create", "xml1", plistPath]);
    execFileSync("plutil", ["-insert", "CFBundleExecutable", "-string", name, plistPath]);
    execFileSync("plutil", ["-insert", "CFBundleName", "-string", "Electron Helper", plistPath]);
    return helperDir;
};

const createBundle = (root) => {
    const frameworks = path.join(root, "Kora Note.app", "Contents", "Frameworks");
    fs.mkdirSync(frameworks, {recursive: true});
    createHelperBundle(frameworks, "Kora Note Helper");
    createHelperBundle(frameworks, "Kora Note Helper (Renderer)");
    return frameworks;
};

const packContext = (appOutDir, electronPlatformName = "darwin") => ({
    electronPlatformName,
    appOutDir,
    packager: {appInfo: {productFilename: "Kora Note"}},
});

test("macOS helper bundles are renamed to the bundle short name", macOSOnly, async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "kora-helper-"));
    try {
        const frameworks = createBundle(root);
        await afterPack(packContext(root));
        assert.deepEqual(fs.readdirSync(frameworks).sort(), ["Kora Helper (Renderer).app", "Kora Helper.app"]);
        for (const [bundle, executable] of [["Kora Helper.app", "Kora Helper"],
            ["Kora Helper (Renderer).app", "Kora Helper (Renderer)"]]) {
            const contents = path.join(frameworks, bundle, "Contents");
            assert.deepEqual(fs.readdirSync(path.join(contents, "MacOS")), [executable]);
            const plistPath = path.join(contents, "Info.plist");
            assert.equal(plistValue(plistPath, "CFBundleExecutable"), executable);
            assert.equal(plistValue(plistPath, "CFBundleName"), executable);
        }
    } finally {
        fs.rmSync(root, {recursive: true, force: true, maxRetries: 5, retryDelay: 100});
    }
});

test("non-macOS platforms keep the packaged helper names", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "kora-helper-"));
    try {
        const frameworks = createBundle(root);
        await afterPack(packContext(root, "win32"));
        assert.deepEqual(fs.readdirSync(frameworks).sort(), ["Kora Note Helper (Renderer).app", "Kora Note Helper.app"]);
    } finally {
        fs.rmSync(root, {recursive: true, force: true, maxRetries: 5, retryDelay: 100});
    }
});
