# EXIFmod — architecture

Technical overview for contributors and tooling (AI agents: see also `[AGENTS.md](../AGENTS.md)`).

## Stack

- **Electron** main process (privileged): IPC, native menus and dialogs, filesystem, ExifTool runner, optional Ollama HTTP calls, image preview encoding, SQLite catalog via **sql.js** (WASM loaded from packaged resources in production).
- **Renderer:** **React** (Vite) UI; **i18next** for localized strings under `[locales/](../locales/)`.
- **Preload:** `[src/preload/index.ts](../src/preload/index.ts)` exposes a single `window.exifmod` API via `contextBridge` — the renderer must not use Node APIs directly.

## Process boundaries

1. **Renderer** must not use Node `fs`, `child_process`, or raw `ipcRenderer`. Use `**window.exifmod`** for all privileged operations.
2. **New IPC:** add a handler in `[src/main/index.ts](../src/main/index.ts)`, a method on `window.exifmod` in `[src/preload/index.ts](../src/preload/index.ts)`, and types in `[src/renderer/src/vite-env.d.ts](../src/renderer/src/vite-env.d.ts)` (and `[src/shared/types.ts](../src/shared/types.ts)` when shared payloads warrant it).
3. **EXIF limits and merge helpers** live in `[src/shared/](../src/shared/)` so main and renderer stay aligned.

## Repository layout (high level)


| Path                                          | Role                                                                                                     |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `[src/main/](../src/main/)`                   | IPC, menus, ExifTool runner, Ollama lifecycle, DB paths, packaged auto-update (macOS + Windows)          |
| `[src/main/exifCore/](../src/main/exifCore/)` | Merge/sanitize/write, SQL catalog                                                                        |
| `[src/renderer/](../src/renderer/)`           | React UI (`App.tsx`, preset editor, panels)                                                              |
| `[src/preload/](../src/preload/)`             | `contextBridge` → `window.exifmod`                                                                       |
| `[src/shared/](../src/shared/)`               | Types, `exifLimits`, `filmKeywords`, i18n helpers                                                        |
| `[locales/](../locales/)`                     | Nested JSON (`ui.`*, `menu.*`, …)                                                                        |
| `[scripts/](../scripts/)`                     | `afterSign` hook for notarization, Homebrew tap publish helper                                           |
| `[install-mac-app](../install-mac-app)`       | macOS: run `npm run build`, copy `EXIFmod.app` → `/Applications`                                         |
| `[homebrew-exifmod/](../homebrew-exifmod/)`   | Tap mirror synced to [prettyoaktree/homebrew-exifmod](https://github.com/prettyoaktree/homebrew-exifmod) |


Path aliases: `@shared` → `src/shared`, `@renderer` → `src/renderer/src` (see `[electron.vite.config.ts](../electron.vite.config.ts)`).

## Preload API (summary)

`window.exifmod` covers paths, locale, dialogs, catalog/presets, EXIF read/merge/apply, **batch `HasSettings` probe** (`exif:probeHasSettings`) for the Lightroom Classic write confirmation, optional Ollama helpers, filesystem helpers, and startup paths for cold “Open With” flows. The **Help** menu can install the bundled **Lightroom Classic** plug-in from `[src/main/installLightroomPlugin.ts](../src/main/installLightroomPlugin.ts)`. The authoritative preload list is in `[src/preload/index.ts](../src/preload/index.ts)`.

## Packaging and releases

- **electron-builder** configuration lives in `[package.json](../package.json)` under `"build"`.
- **Releases** are published on **[GitHub Releases](https://github.com/prettyoaktree/exifmod-electron/releases)**:
  - **macOS:** DMG + ZIP + `latest-mac.yml` (auto-update). CI: `[.github/workflows/release-macos.yml](../.github/workflows/release-macos.yml)` (signed + notarized when secrets are configured).
  - **Windows:** NSIS installer + `latest.yml` (auto-update). CI: `[.github/workflows/release-windows.yml](../.github/workflows/release-windows.yml)`.
- **Homebrew cask** (macOS only) lives in the separate tap repo; `[scripts/publish-homebrew-tap-release.sh](../scripts/publish-homebrew-tap-release.sh)` bumps the cask to point at the app repo DMG URL.
- **Winget** (Windows): staged multi-file manifests under `[winget/manifests/](../winget/manifests)` are published to [microsoft/winget-pkgs](https://github.com/microsoft/winget-pkgs) via [`scripts/publish-winget-release.sh`](../scripts/publish-winget-release.sh) (set **`WINGET_PKGS_DIR`** to your fork clone, like **`TAP_DIR`** for Homebrew); see `[.cursor/skills/exifmod-release/SKILL.md](../.cursor/skills/exifmod-release/SKILL.md)`.

Operator-only signing (Apple + optional Windows), notarization, and GitHub Actions setup are documented in `[maintainer.md](../maintainer.md)` (secret names and procedures only—never commit real credentials).

## macOS behavior notes

- **Open With** (`.jpg`, `.jpeg`, `.tif`, `.tiff`): Finder can open files with EXIFmod; the app loads the **parent folder** as the session and **selects** the opened file. **Multiple** files + Open With shows a dialog and does not load a session.
- **Closing the main window** quits the app (custom `window-all-closed` behavior), not the default “stay in Dock with no windows.”
- **Menu bar shows “Electron” during development** — packaged builds use `build.productName` (`EXIFmod`). See `[README.md](../README.md)`.
- **Development user data** — `[src/main/setDevUserDataPath.ts](../src/main/setDevUserDataPath.ts)` redirects Electron `userData` to a sibling folder with a `-dev` suffix when `!app.isPackaged`, so preset SQLite and preferences do not overlap the installed app. See the README “Development vs release data” section.

## Tests

**Vitest** — unit tests near sources (e.g. `*.test.ts`), integration-style tests for ExifTool where applicable. Run `npm test` after behavioral changes.

## Related docs


| Document                                                | Contents                                                  |
| ------------------------------------------------------- | --------------------------------------------------------- |
| `[docs/product.md](product.md)`                         | User-visible behavior and workflows                       |
| `[docs/status-footer.md](status-footer.md)`             | Status footer: conditions → lights → copy → actions (keep in sync when adding features) |
| `[docs/exif-preset-mapping.md](exif-preset-mapping.md)` | EXIF tags, preset merge order, Film/Keywords, AI behavior |
