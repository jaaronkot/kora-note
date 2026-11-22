<p align="center">
<img alt="Kora Note" src="app/appearance/boot/boot-logo.png" width="128">
<br>
<em>From thought to insight, with agents</em>
<br><br>
<b>A trimmed-down, rebranded build of SiYuan Note</b>
<br><br>
<a title="Releases" target="_blank" href="https://github.com/jaaronkot/kora-note/releases"><img src="https://img.shields.io/github/release/jaaronkot/kora-note.svg?style=flat-square&color=9CF"></a>
<a title="Downloads" target="_blank" href="https://github.com/jaaronkot/kora-note/releases"><img src="https://img.shields.io/github/downloads/jaaronkot/kora-note/total.svg?style=flat-square&color=blueviolet"></a>
<a title="AGPLv3" target="_blank" href="https://www.gnu.org/licenses/agpl-3.0.txt"><img src="https://img.shields.io/badge/license-AGPLv3-orange.svg?style=flat-square"></a>
</p>

<p align="center">
<a href="README.zh-CN.md">简体中文</a> | <b>English</b>
</p>

---

## Introduction

Kora Note is a personal fork of [SiYuan Note](https://github.com/siyuan-note/siyuan), built from the community edition at v3.8.10. It keeps the block-based editor, the local-first file format, the encrypted notebook support and the whole block-reference / database / AI-agent feature set, but cuts the parts that were never used here and reshapes the interface around a smaller, calmer daily workflow.

The name follows the koala on the boot screen: **Kora** for the app, **Kora Note** for the product.

Everything that used to point at the upstream project now points at this repository, including the in-app update channel.

## What changed

### Removed

The following features were dropped to shrink the installer and the maintenance surface:

- Image OCR, including AI-assisted OCR. The OCR engines (PaddleOCR, ONNXRuntime) are no longer shipped with the app.
- Pandoc-based import and export, including the bundled Pandoc binaries and filters.
- The official cloud account and subscription system, together with the cloud asset source and cloud service endpoints.
- The Inbox.
- In-app purchases on iOS.
- Cloud object-storage sync probing and validation.
- The Marketplace and Flashcard tabs in Settings.
- Daily Notes and its slash command.

### Rebranded

- The app is called **Kora Note**; the macOS application menu shows **Kora**. The boot screen, window icon, export format names (`Kora.sy.zip`, `HTML (Kora)`), Linux file association, and the Windows store manifest follow the same naming.
- The boot screen was rebuilt around a static koala logo, a slim progress bar and the version number. It follows the system light/dark appearance and disables animation when the system asks for reduced motion.
- The About panel keeps only the version section: current version, update check, changelog and runtime info.

### Interface and interaction

- **Top bar.** Only back, forward and zoom are left there. Global search and the main menu moved into the left dock, while the command panel button, the appearance-mode switch and the daily-note and flashcard buttons are gone.
- **Panel layout.** The linkage graph and backlinks panels moved to the left dock, right after the outline. The right dock starts empty.
- **Panel numbering.** Dock shortcuts now follow the order the icons appear in the dock: file tree, outline, linkage graph, backlinks, bookmarks, tags.
- **Title bar.** The window title shows the document name followed by the product name, without the workspace name or the version number.
- **Sync button.** Cloud sync moved out of the top bar to the bottom of the left dock, directly above the settings gear.
- **Exit prompt.** Quitting now shows a small corner overlay instead of a modal dialog. On the desktop it is anchored above the sync button, on mobile above the more button in the bottom bar. A "skip sync" action appears after 12 seconds.
- **Breadcrumb icons.** The first breadcrumb entry uses a document icon, and the document action on the right uses a sliders icon, so the two are no longer easy to confuse.

### Keyboard shortcuts

- Application-level shortcuts follow the macOS system conventions and VS Code. Editor insertion shortcuts follow Notion. Bindings that clash with native macOS menu roles were moved aside.
- Dock shortcuts are numbered by the dock icon order, see above.
- Existing default bindings are migrated automatically on the first launch. Customized bindings are never overwritten, and the migration is idempotent.

### Distribution

- Installers are named `koranote-{version}-{os}-{arch}`.
- The in-app update channel, the feedback entry, the official website entry and the source-code entry all point at this repository.

## Download

Grab a build from the [releases page](https://github.com/jaaronkot/kora-note/releases). macOS builds are signed with a Developer ID certificate.

## Build from source

The kernel is a Go binary and is built first, into the folder the packer expects:

```bash
git clone https://github.com/jaaronkot/kora-note.git
cd kora-note/kernel
go build -tags "fts5 sqlcipher" -o ../app/kernel-darwin-arm64/SiYuan-Kernel -ldflags "-s -w" .
```

Then the frontend bundles and the installer:

```bash
cd ../app
pnpm install
pnpm run build               # builds the frontend bundles into stage/
pnpm run dist-darwin-arm64   # packages the macOS arm64 app
```

Use `dist-darwin`, `dist-linux` or `dist-arm64` for the other targets.

## Acknowledgements

Kora Note is built on the shoulders of [SiYuan Note](https://github.com/siyuan-note/siyuan) and its community edition. The original project documentation is kept in this repository as `README.upstream.md` and its translations as `README.upstream.*.md`.

## License

Kora Note is distributed under the [GNU Affero General Public License v3.0 or later](LICENSE), the same license as the upstream project it is based on.
