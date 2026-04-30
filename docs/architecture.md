# EXIFmod — architecture

Technical overview for contributors and tooling (AI agents: see also [AGENTS.md](../AGENTS.md)).

## Stack

- **Electron** main process (privileged): IPC, native menus and dialogs, filesystem, ExifTool runner, optional Ollama HTTP (AI describe, `getDescribeSystemPrompt` for the status panel), image preview encoding, SQLite catalog via **sql.js** (WASM loaded from packaged resources in production).
- **Renderer:** **React** (Vite) UI; **i18next** for localized strings under [locales/](../locales/).
- **Preload:** [src/preload/index.ts](../src/preload/index.ts) exposes a single `window.exifmod` API via `contextBridge` — the renderer must not use Node APIs directly.

## Process boundaries

1. **Renderer** must not use Node `fs`, `child_process`, or raw `ipcRenderer`. Use **`window.exifmod`** for all privileged operations.
2. **New IPC:** add a handler in [src/main/index.ts](../src/main/index.ts), a method on `window.exifmod` in [src/preload/index.ts](../src/preload/index.ts), and types in [src/renderer/src/vite-env.d.ts](../src/renderer/src/vite-env.d.ts) (and [src/shared/types.ts](../src/shared/types.ts) when shared payloads warrant it).
3. **EXIF limits and merge helpers** live in [src/shared/](../src/shared/) so main and renderer stay aligned.

## Repository layout (high level)


| Path                                          | Role                                                                                                     |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| [src/main/](../src/main/)                     | IPC, menus, ExifTool runner, Ollama lifecycle, DB paths, packaged auto-update (macOS + Windows)          |
| [src/main/exifCore/](../src/main/exifCore/)   | Merge/sanitize/write, SQL catalog                                                                        |
| [src/renderer/](../src/renderer/)             | React UI (`App.tsx`, preset editor, panels)                                                              |
| [src/preload/](../src/preload/)               | `contextBridge` → `window.exifmod`                                                                       |
| [src/shared/](../src/shared/)                 | Types, `exifLimits`, `filmKeywords`, i18n helpers                                                        |
| [locales/](../locales/)                       | Nested JSON (`ui.`*, `menu.*`, …)                                                                        |
| [scripts/](../scripts/)                       | `afterSign` hook for notarization, Homebrew tap publish helper                                           |
| [install-mac-app](../install-mac-app)         | macOS: run `npm run build`, copy `EXIFmod.app` → `/Applications`                                         |
| [homebrew-exifmod/](../homebrew-exifmod/)     | Tap mirror synced to [prettyoaktree/homebrew-exifmod](https://github.com/prettyoaktree/homebrew-exifmod) |


Path aliases: `@shared` → `src/shared`, `@renderer` → `src/renderer/src` (see [electron.vite.config.ts](../electron.vite.config.ts)).

## Preload API (summary)

`window.exifmod` covers paths, locale, dialogs, catalog/presets, EXIF read (single-file and **folder batch** with progress), merge/apply (raster in-file vs **RAW → XMP sidecar** in main), remembered-dialog preferences (Lightroom snapshot tip, pre-write backup), optional Ollama helpers (`ollamaDescribeImage`, `ollamaGetDescribeSystemPrompt`, `ollamaGetDescribeSystemPromptState`, `ollamaSetDescribeSystemPrompt`), filesystem helpers, and startup paths for cold “Open With” flows. The **Help** menu runs **`performLrPluginInstall`** in main ([`src/main/installLightroomPlugin.ts`](../src/main/installLightroomPlugin.ts)); the renderer shows success or failure in the same **in-app** `modal-backdrop` / `modal-dialog-confirm` pattern as other confirmations (not a native `dialog.showMessageBox`). Also: reset remembered prompts. The authoritative preload list is in [src/preload/index.ts](../src/preload/index.ts).

## Packaging and releases

- **electron-builder** configuration lives in [package.json](../package.json) under `"build"`.
- **Releases** are published on **[GitHub Releases](https://github.com/prettyoaktree/exifmod/releases)**:
  - **macOS:** DMG + ZIP + `latest-mac.yml` (auto-update). CI: [.github/workflows/release-macos.yml](../.github/workflows/release-macos.yml) (signed + notarized when secrets are configured).
  - **Windows:** NSIS installer + `latest.yml` (auto-update). CI: [.github/workflows/release-windows.yml](../.github/workflows/release-windows.yml).
- **Homebrew cask** (macOS only) lives in the separate tap repo; [scripts/publish-homebrew-tap-release.sh](../scripts/publish-homebrew-tap-release.sh) bumps the cask to point at the app repo DMG URL.
- **Winget** (Windows): staged multi-file manifests under [winget/manifests/](../winget/manifests) are published to [microsoft/winget-pkgs](https://github.com/microsoft/winget-pkgs) via [scripts/publish-winget-release.sh](../scripts/publish-winget-release.sh) (set **`WINGET_PKGS_DIR`** to your fork clone, like **`TAP_DIR`** for Homebrew); see [.cursor/skills/exifmod-release/SKILL.md](../.cursor/skills/exifmod-release/SKILL.md).

Operator-only signing (Apple + optional Windows), notarization, and GitHub Actions setup are documented in [maintainer.md](../maintainer.md) (secret names and procedures only—never commit real credentials).

## macOS behavior notes

- **Open With** (`.jpg`, `.jpeg`, `.tif`, `.tiff`): Finder can open files with EXIFmod; the app loads the **parent folder** as the session and **selects** the opened file. **Multiple** files + Open With shows a dialog and does not load a session.
- **Closing the main window** quits the app (custom `window-all-closed` behavior), not the default “stay in Dock with no windows.”
- **Menu bar shows “Electron” during development** — packaged builds use `build.productName` (`EXIFmod`). See [README.md](../README.md).
- **Development user data** — [src/main/setDevUserDataPath.ts](../src/main/setDevUserDataPath.ts) redirects Electron `userData` to a sibling folder with a `-dev` suffix when `!app.isPackaged`, so preset SQLite and preferences do not overlap the installed app.

## Lightroom Classic plugin (technical)

End-user documentation for the Lightroom flow is in the [user guide](https://prettyoaktree.github.io/exifmod/docs/) (source: [docs/user/](user/)). This section covers how the bundled plug-ins invoke EXIFmod on **macOS** and **Windows** (not Linux).

- **Help → Install Lightroom Classic Plugin…** (macOS/Windows) triggers **`app:installLrPlugin`**, which copies the bundled plug-ins from [src/main/installLightroomPlugin.ts](../src/main/installLightroomPlugin.ts) into Adobe’s per-user **Modules** folder, replacing any previous copy for upgrades: **macOS** `~/Library/Application Support/Adobe/Lightroom/Modules/`, **Windows** `%APPDATA%\Adobe\Lightroom\Modules\`. The result is returned to the renderer and shown in an **in-app modal** ([`App.tsx`](../src/renderer/src/App.tsx)).
- **macOS** — The plug-ins use **`LrShell.openPathsViaCommandLine`** with **`/usr/bin/open -n -a <app> --args --exifmod-from-lrc [repo]`** so the app receives the image (and, in the dev plug-in, the repo root) on the command line. **`-n`** starts a short-lived second process so Electron can emit **`second-instance`** with full `argv`; without **`-n`**, macOS often only activates the app and the image path never reaches EXIFmod. For the **release** plug-in, **Help → Install** from a **packaged** app rewrites a placeholder in **`OpenInExifmod.lua`** with the **`.app` bundle** path of the running build (`…/Resources` → `..` / `..` from `process.resourcesPath`). If that was not used (repo copy, dev), the plug-in still falls back to **`/Applications/EXIFmod.app`**. The **dev** build (`npm run dev`) also installs **EXIFmod Open (Dev)**; it is patched to **`node_modules/electron/dist/Electron.app`** and the absolute repo root.
- **Windows** — The same API runs **`EXIFmod.exe`** (or the patched **`electron.exe`** for the dev plug-in) with **`--exifmod-from-lrc`** and the file path, so a second process triggers **`second-instance`**. **Help → Install** from a **packaged** app bakes **`app.getPath('exe')`** into **`OpenInExifmod.lua`**. Otherwise the plug-in uses **`%LOCALAPPDATA%\Programs\exifmod\EXIFmod.exe`**, or the preference key **`exifmodAppPath`**.
- Finder and other **Open With** flows do **not** add the **`--exifmod-from-lrc`** marker; the plug-in exists so Lightroom can set it.
- Use **Library → Plug-in Extras → Open in EXIFmod Dev** for the dev flow. From a **packaged release app**, only **EXIFmod Open** is installed.

## Tests

**Vitest** — unit tests near sources (e.g. `*.test.ts`), integration-style tests for ExifTool where applicable. Run `npm test` after behavioral changes.

## Related docs


| Document                                                | Contents                                                  |
| ------------------------------------------------------- | --------------------------------------------------------- |
| [docs/user/](user/) (published [here](https://prettyoaktree.github.io/exifmod/docs/)) | User guide; [docs/product.md](product.md) is a short pointer        |
| [docs/status-footer.md](status-footer.md)               | Status footer: conditions → lights → chevron → panel (keep in sync when adding features) |
| [docs/exif-preset-mapping.md](exif-preset-mapping.md)   | EXIF tags, preset merge order, Film/Keywords, AI behavior |
