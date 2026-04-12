# EXIFmod

Electron desktop app for editing EXIF metadata using a preset catalog.

## Overview

- **Stack:** Electron, **React** (Vite), **TypeScript**. Presets live in **SQLite** via **sql.js**.
- **EXIF I/O:** The main process runs **ExifTool**; a working install is required (see preflight / tool resolution in the main process).
- **Metadata UI:** **Description** (EXIF `ImageDescription`) and **Keywords** respect EXIF-safe UTF‑8 limits (`src/shared/exifLimits.ts`). **Preview EXIF changes** shows only tags that would **differ** from each file’s current metadata (`src/renderer/src/exif/payloadDiff.ts`); the preview is empty when nothing would change.
- **Optional AI:** A **local Ollama** server can append descriptions and merge keywords for **one or more** staged files (`ollama:describeImage` on `window.exifmod`). On launch, **`ollama:startupFlow`** checks reachability; if needed, an **inline** control starts **`ollama serve`** via **`ollama:tryStartServer`**. The AI button shows availability (blue border) only after Ollama is reachable or successfully started. Multi-file runs use a confirmation step, show **Generating (n/total)…** progress, **continue on per-file errors**, then offer a summary dialog with **retry failed files** if needed. Loopback-only; defaults and env vars are documented in `docs/exif-preset-mapping.md`.
- **Menus:** **File** (preset database import/export) and **Edit** (standard clipboard roles: Copy, Paste, Select All, …). The Edit menu is required on macOS so ⌘C / ⌘A work in the renderer.

### Documentation


| Document                                                     | Contents                                                   |
| ------------------------------------------------------------ | ---------------------------------------------------------- |
| `[docs/product.md](docs/product.md)`                         | Product overview, user-facing features, and workflows      |
| `[docs/exif-preset-mapping.md](docs/exif-preset-mapping.md)` | EXIF tags, preset merge rules, and implementation pointers |


**Maintenance:** When you implement or change behavior, **keep these docs aligned** with the app—especially `docs/product.md` for anything users see, and `docs/exif-preset-mapping.md` for EXIF/preset semantics.

## Getting started

```bash
npm install
npm run dev
```


| Command                           | Purpose                                                                                |
| --------------------------------- | -------------------------------------------------------------------------------------- |
| `npm run dev`                     | Development: **electron-vite** + Electron                                              |
| `npm run build`                   | Typecheck, **electron-vite build**, **electron-builder** (installers under `release/`) |
| `npm run build:vite`              | Build main/preload/renderer only (no installer)                                        |
| `npm run preview`                 | electron-vite preview                                                                  |
| `npm test` / `npm run test:watch` | **Vitest** (unit + integration-style tests)                                            |

### macOS: install a release build to `/Applications`

From the repository root (after `npm install`):

```bash
./install-mac-app
```

This runs **`npm run build`** (typecheck, Vite, **electron-builder**), then copies the packaged **`EXIFmod.app`** from **`release/`** to **`/Applications/EXIFmod.app`** with **`ditto`**, replacing an existing app bundle if present. The script exits with an error on non-macOS hosts.

## EXIF, presets, and domain behavior

Preset merge order, which tags are written or stripped, Film/Keywords, Author/Copyright, and pointers to implementation files are documented in `[docs/exif-preset-mapping.md](docs/exif-preset-mapping.md)`. Read it before changing preset editing or EXIF write behavior. For a user-oriented summary, see `[docs/product.md](docs/product.md)`.

## Repository layout


| Path                 | Role                                                                                             |
| -------------------- | ------------------------------------------------------------------------------------------------ |
| `install-mac-app`    | macOS helper: build release (`npm run build`) and copy `EXIFmod.app` to `/Applications`          |
| `src/main/`          | Main process: IPC, ExifTool runner, preset DB, filesystem, menus                                 |
| `src/main/exifCore/` | EXIF merge/sanitize/write, SQL catalog (`constants.ts`, `store.ts`, `pure.ts`, …)                |
| `src/renderer/`      | React UI; `@renderer` → `src/renderer/src`, `@shared` → `src/shared` (`electron.vite.config.ts`) |
| `src/preload/`       | Exposes `window.exifmod` via `contextBridge` (`src/preload/index.ts`)                            |
| `src/shared/`        | Shared types and helpers (`types.ts`, `exifLimits.ts`, `filmKeywords.ts`, `i18n/resolveLocale.ts`, …) |
| `locales/`           | UI strings per language (nested JSON keys)                                                       |
| `out/`               | Build output (do not hand-edit)                                                                  |
| `release/`           | Packaged artifacts from `npm run build`                                                          |


The preload API (`window.exifmod`) covers paths, locale, dialogs, catalog/presets, EXIF read/merge/apply, optional **`ollamaDescribeImage`**, **`ollamaStartupFlow`**, **`ollamaCheckAvailability`**, and **`ollamaTryStartServer`**, filesystem helpers, and startup paths for cold “Open With” flows.

## Development conventions

- Match existing IPC naming, error handling, and React patterns; keep changes focused.
- **UI copy:** `locales/`; for a new locale file, add the base language code to `SUPPORTED` in `src/shared/i18n/resolveLocale.ts`.
- **EXIF / presets:** Coordinate `src/main/exifCore/` with `PresetEditor.tsx`, `App.tsx`, and `docs/exif-preset-mapping.md`; run `npm test` after behavioral changes.
- **Docs:** Update `[docs/product.md](docs/product.md)` when features or UX change; update `[docs/exif-preset-mapping.md](docs/exif-preset-mapping.md)` when EXIF or preset rules change.
- **Types:** `src/shared/types.ts` should stay aligned with preload methods and main IPC handlers.

### Tests

**Vitest** covers units (e.g. `src/main/exifCore/pure.test.ts`) and tooling integration (e.g. `src/main/exiftool.integration.test.ts`).

### AI assistants and optional project rules

Automated assistants should read **[`AGENTS.md`](AGENTS.md)** for repo-specific boundaries and commands, plus this README and `[docs/product.md](docs/product.md)` / `[docs/exif-preset-mapping.md](docs/exif-preset-mapping.md)` as the source of truth. Optional **Cursor** rules live under `.cursor/rules/` if present—keep them consistent with those docs.

## Localization

- Strings live under `locales/` (e.g. `en.json`, `fr.json`) with nested keys (`menu.file`, `ui.commitChanges`, …).
- Language follows the OS (`app.getLocale()` in main; renderer uses `getLocale()` IPC). Unknown locales fall back to English.
- New locales: copy `locales/en.json`, translate **values** only, register the base code in `src/shared/i18n/resolveLocale.ts`.
- Interpolation uses `{{name}}` placeholders—preserve them in translations.

## macOS notes

### Menu bar shows “Electron” during development

With `npm run dev`, the process is the prebuilt **Electron.app** from `node_modules`. The name next to the Apple menu comes from that bundle’s **Info.plist** (`CFBundleName`), not from `app.setName()` or menu templates—`app.getName()` can still be `EXIFmod` while the menu bar shows **Electron**.

**Packaged builds** (`npm run build`) apply `**build.productName`** (`EXIFmod`) to the `.app`, so the menu bar shows the correct name. Use a release build to verify branding. To install that bundle into **`/Applications`**, use **`./install-mac-app`** (see **Getting started** above).

**Optional (dev only):** You can edit `CFBundleName` / `CFBundleDisplayName` under `node_modules/electron/dist/Electron.app/Contents/Info.plist` (re-apply after Electron upgrades; `patch-package` can persist the change).

### Finder, Dock, and Open With

- **Open With** (`.jpg`, `.jpeg`, `.tif`, `.tiff`): After a release install, Finder can open files with EXIFmod. The app loads the **parent folder** as the session and **selects** the opened file. **Multiple** files + Open With shows a dialog and does not load a session.
- **Dock:** Dropping a supported image on the icon should match Open With when the system passes a single path.
- **Closing the main window** quits the app (unlike the default Electron macOS behavior of keeping the process alive with no windows).

#### Manual checks (release build)

1. **File:** Open With → EXIFmod on a `.jpg` in a folder with several images; the sidebar lists supported images and the opened row is selected.
2. **Multi-select** + Open With → short native dialog, no partial load.
3. **App already running:** Open With another image → session switches to the new folder and selection.

