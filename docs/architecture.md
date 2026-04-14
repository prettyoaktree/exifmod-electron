# EXIFmod — architecture

Technical overview for contributors and tooling (AI agents: see also [`AGENTS.md`](../AGENTS.md)).

## Stack

- **Electron** main process (privileged): IPC, native menus and dialogs, filesystem, ExifTool runner, optional Ollama HTTP calls, image preview encoding, SQLite catalog via **sql.js** (WASM loaded from packaged resources in production).
- **Renderer:** **React** (Vite) UI; **i18next** for localized strings under [`locales/`](../locales/).
- **Preload:** [`src/preload/index.ts`](../src/preload/index.ts) exposes a single `window.exifmod` API via `contextBridge` — the renderer must not use Node APIs directly.

## Process boundaries

1. **Renderer** must not use Node `fs`, `child_process`, or raw `ipcRenderer`. Use **`window.exifmod`** for all privileged operations.
2. **New IPC:** add a handler in [`src/main/index.ts`](../src/main/index.ts), a method on `window.exifmod` in [`src/preload/index.ts`](../src/preload/index.ts), and types in [`src/renderer/src/vite-env.d.ts`](../src/renderer/src/vite-env.d.ts) (and [`src/shared/types.ts`](../src/shared/types.ts) when shared payloads warrant it).
3. **EXIF limits and merge helpers** live in [`src/shared/`](../src/shared/) so main and renderer stay aligned.

## Repository layout (high level)

| Path | Role |
| ---- | ---- |
| [`src/main/`](../src/main/) | IPC, menus, ExifTool runner, Ollama lifecycle, DB paths, macOS auto-update wiring |
| [`src/main/exifCore/`](../src/main/exifCore/) | Merge/sanitize/write, SQL catalog |
| [`src/renderer/`](../src/renderer/) | React UI (`App.tsx`, preset editor, panels) |
| [`src/preload/`](../src/preload/) | `contextBridge` → `window.exifmod` |
| [`src/shared/`](../src/shared/) | Types, `exifLimits`, `filmKeywords`, i18n helpers |
| [`locales/`](../locales/) | Nested JSON (`ui.*`, `menu.*`, …) |
| [`scripts/`](../scripts/) | `afterSign` hook for notarization, Homebrew tap publish helper |
| [`install-mac-app`](../install-mac-app) | macOS: run `npm run build`, copy `EXIFmod.app` → `/Applications` |
| [`homebrew-exifmod/`](../homebrew-exifmod/) | Tap mirror synced to [prettyoaktree/homebrew-exifmod](https://github.com/prettyoaktree/homebrew-exifmod) |

Path aliases: `@shared` → `src/shared`, `@renderer` → `src/renderer/src` (see [`electron.vite.config.ts`](../electron.vite.config.ts)).

## Preload API (summary)

`window.exifmod` covers paths, locale, dialogs, catalog/presets, EXIF read/merge/apply, optional Ollama helpers, filesystem helpers, and startup paths for cold “Open With” flows. The authoritative list is in [`src/preload/index.ts`](../src/preload/index.ts).

## macOS packaging and releases

- **electron-builder** configuration lives in [`package.json`](../package.json) under `"build"`.
- **Releases** for the signed app are published on **[GitHub Releases](https://github.com/prettyoaktree/exifmod-electron/releases)** (DMG + ZIP + `latest-mac.yml` for auto-updates). CI workflow: [`.github/workflows/release-macos.yml`](../.github/workflows/release-macos.yml).
- **Homebrew cask** metadata lives in the separate tap repo; [`scripts/publish-homebrew-tap-release.sh`](../scripts/publish-homebrew-tap-release.sh) bumps the cask to point at the app repo DMG URL.

Operator-only signing, notarization, and GitHub Actions secrets are documented locally in **`maintainer.md`** (gitignored; see [`maintainer.md.example`](../maintainer.md.example)).

## macOS behavior notes

- **Open With** (`.jpg`, `.jpeg`, `.tif`, `.tiff`): Finder can open files with EXIFmod; the app loads the **parent folder** as the session and **selects** the opened file. **Multiple** files + Open With shows a dialog and does not load a session.
- **Closing the main window** quits the app (custom `window-all-closed` behavior), not the default “stay in Dock with no windows.”
- **Menu bar shows “Electron” during development** — packaged builds use `build.productName` (`EXIFmod`). See [`README.md`](../README.md).

## Tests

**Vitest** — unit tests near sources (e.g. `*.test.ts`), integration-style tests for ExifTool where applicable. Run `npm test` after behavioral changes.

## Related docs

| Document | Contents |
| -------- | -------- |
| [`docs/product.md`](product.md) | User-visible behavior and workflows |
| [`docs/exif-preset-mapping.md`](exif-preset-mapping.md) | EXIF tags, preset merge order, Film/Keywords, AI behavior |
