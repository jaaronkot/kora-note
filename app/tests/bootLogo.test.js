const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");

const THEMES = {
    dark: {background: "rgb(30, 30, 30)"},
    light: {background: "rgb(245, 246, 248)"},
};

if (process.versions.electron && process.type === "browser") {
    const {app, BrowserWindow} = require("electron");
    app.setPath("userData", process.argv[2]);
    app.disableHardwareAcceleration();
    app.whenReady().then(async () => {
        const win = new BrowserWindow({show: false, width: 756, height: 472,
            webPreferences: {nodeIntegration: true, contextIsolation: false, backgroundThrottling: false}});
        try {
            win.webContents.on("console-message", event => { if (event.level === "error") console.error(event.message); });
            await win.loadURL("about:blank");
            win.webContents.debugger.attach("1.3");
            await win.webContents.debugger.sendCommand("Page.enable");
            for (const page of ["electron/static/boot.html", "appearance/boot/index.html"]) {
                for (const theme of Object.keys(THEMES)) {
                    const script = `window.fetch = () => new Promise(() => {});
                        window.sources = [];
                        window.EventSource = class { constructor() { window.sources.push(this); } close() {} };`;
                    const injection = await win.webContents.debugger.sendCommand("Page.addScriptToEvaluateOnNewDocument", {source: script});
                    win.webContents.setUserAgent(page.startsWith("appearance/") ? "Mozilla/5.0 Chrome/130.0" : "Mozilla/5.0 Electron/44.0");
                    await win.loadFile(path.join(__dirname, "..", page), {query: {v: "test", lang: "en", theme}});
                    await new Promise(resolve => setTimeout(resolve, 160));
                    const result = await win.webContents.executeJavaScript(`(() => {
                        const logo = document.getElementById("bootLogo");
                        const status = document.getElementById("bootStatus");
                        const details = document.getElementById("details");
                        const track = document.getElementById("progressTrack");
                        const version = document.getElementById("bootVersion");
                        const animations = logo ? logo.getAnimations() : [];
                        const running = animations.filter(animation => animation.playState === "running");
                        const initialDetails = details.textContent;
                        if (window.sources.length) window.sources[window.sources.length - 1].onmessage({data: JSON.stringify({progress:100,details:"ready"})});
                        animations.forEach(animation => animation.finish());
                        const logoBox = logo.getBoundingClientRect();
                        const statusBox = status.getBoundingClientRect();
                        const versionBox = version.getBoundingClientRect();
                        return {tag: logo && logo.tagName, source: logo && logo.getAttribute("src"),
                            radius: logo && getComputedStyle(logo).borderRadius,
                            animating: running.length > 0, opacity: logo && getComputedStyle(logo).opacity,
                            noSvg: !document.querySelector("#bg svg"), noStreak: !document.querySelector(".streak"),
                            stacked: logoBox.bottom <= statusBox.top && statusBox.bottom <= versionBox.top,
                            versionText: version.textContent, detailsText: initialDetails, progressDetails: details.textContent,
                            trackInside: track.contains(document.getElementById("progress")),
                            versionSmall: parseFloat(getComputedStyle(version).fontSize) <= 12,
                            background: getComputedStyle(document.body).backgroundColor};
                    })()`);
                    const label = `${page}/${theme}`;
                    assert.equal(result.tag, "IMG", `${label}: logo must be an image`);
                    assert.equal(result.source, "boot-logo.png", `${label}: logo must reference the brand asset`);
                    assert.notEqual(result.radius, "0px", `${label}: logo must keep the app icon rounding`);
                    assert.equal(result.animating, true, `${label}: logo must fade in`);
                    assert.equal(result.opacity, "1", `${label}: logo must be visible after the fade`);
                    assert.equal(result.noSvg, true, `${label}: the folded SiYuan mark must be gone`);
                    assert.equal(result.noStreak, true, `${label}: the streak animation must be gone`);
                    assert.equal(result.stacked, true, `${label}: logo, status and version must stack top to bottom`);
                    assert.equal(result.versionText, "vtest", `${label}: version must stay on its own line`);
                    assert.equal(result.detailsText, "Booting kernel...", `${label}: status must not repeat the version`);
                    assert.equal(result.progressDetails, "ready", `${label}: kernel progress must refresh the status`);
                    assert.equal(result.trackInside, true, `${label}: progress must live inside the track`);
                    assert.equal(result.versionSmall, true, `${label}: version must use the smaller type`);
                    assert.equal(result.background, THEMES[theme].background, `${label}: background must follow the theme`);
                    await win.webContents.debugger.sendCommand("Page.removeScriptToEvaluateOnNewDocument", {identifier: injection.identifier});
                }
            }
            console.log("Boot logo layout and themes passed");
            win.destroy(); app.exit(0);
        } catch (error) {
            console.error(error); win.destroy(); app.exit(1);
        }
    }).catch(error => { console.error(error); app.exit(1); });
} else {
    require("node:test").test("boot pages stack the brand logo, status and version and follow the theme", {timeout: 60000}, async () => {
        const profile = fs.mkdtempSync(path.join(os.tmpdir(), "siyuan-boot-variants-"));
        const env = {...process.env}; delete env.ELECTRON_RUN_AS_NODE;
        try {
            const {stdout} = await require("node:util").promisify(require("node:child_process").execFile)(
                require("electron"), [__filename, profile], {env, windowsHide: true, timeout: 55000});
            assert.match(stdout, /Boot logo layout and themes passed/);
        } finally {
            assert.equal(path.dirname(path.resolve(profile)), path.resolve(os.tmpdir()));
            fs.rmSync(profile, {recursive: true, force: true, maxRetries: 5, retryDelay: 100});
        }
    });
}
