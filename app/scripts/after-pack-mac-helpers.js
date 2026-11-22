const fs = require("node:fs");
const path = require("node:path");
const {execFileSync} = require("node:child_process");

// macOS 的应用菜单标题取自 bundle 的 CFBundleName，Electron 启动时也用 CFBundleName
// 拼出 Helper 进程的完整路径；两者不一致会直接 FATAL 退出。打包后把 Helper 统一改成
// bundle 短名，使其与 CFBundleName 对齐。本钩子在签名前执行，改名后的 Helper 会被正常签名。
const BUNDLE_NAME = "Kora";
const PRODUCT_NAME = "Kora Note";

const writePlistString = (plistPath, key, value) => {
    execFileSync("plutil", ["-replace", key, "-string", value, plistPath], {stdio: "ignore"});
};

const renameHelper = (helperPath) => {
    const contents = path.join(helperPath, "Contents");
    const macOSDir = path.join(contents, "MacOS");
    if (!fs.existsSync(macOSDir)) {
        return;
    }
    // 内部可执行文件名需与 CFBundleExecutable 一致，否则 macOS 无法拉起该 Helper
    for (const entry of fs.readdirSync(macOSDir)) {
        const shortEntry = entry.replace(PRODUCT_NAME, BUNDLE_NAME);
        if (shortEntry !== entry) {
            fs.renameSync(path.join(macOSDir, entry), path.join(macOSDir, shortEntry));
        }
    }
    const plistPath = path.join(contents, "Info.plist");
    if (!fs.existsSync(plistPath)) {
        return;
    }
    const executable = fs.readdirSync(macOSDir).find((entry) => entry.includes(BUNDLE_NAME));
    if (executable) {
        writePlistString(plistPath, "CFBundleExecutable", executable);
    }
    writePlistString(plistPath, "CFBundleName", executable || BUNDLE_NAME);
    const shortName = path.basename(helperPath).replace(PRODUCT_NAME, BUNDLE_NAME);
    if (shortName !== path.basename(helperPath)) {
        fs.renameSync(helperPath, path.join(path.dirname(helperPath), shortName));
    }
};

const afterPack = async (context) => {
    if (context.electronPlatformName !== "darwin") {
        return;
    }
    const productFilename = context.packager.appInfo.productFilename;
    const frameworks = path.join(context.appOutDir, `${productFilename}.app`, "Contents", "Frameworks");
    if (!fs.existsSync(frameworks)) {
        return;
    }
    for (const name of fs.readdirSync(frameworks)) {
        if (!name.startsWith(`${PRODUCT_NAME} Helper`)) {
            continue;
        }
        renameHelper(path.join(frameworks, name));
    }
};

module.exports = {afterPack};
