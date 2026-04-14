# Agent guide — EXIFmod

Concise instructions for AI coding agents and automated assistants working in this repository.

## What this project is

**EXIFmod** is an **Electron** desktop app for editing **EXIF** metadata using a **preset catalog** stored in **SQLite** (via **sql.js**). The main process runs **ExifTool** for read/write. The renderer is **React** (Vite) with **i18next**; strings live in `**locales/`**.

Optional **Ollama** integration calls a **local** HTTP server (`ollamaDescribeImage`, cached startup warmup, uncached `**ollamaCheckAvailability`** after describe transport failures, inline `**ollamaTryStartServer`** when the user starts `**ollama serve**` from the UI); EXIFmod does **not** bundle Ollama.

## Authoritative docs (read before risky changes)


| Document                                                                   | Use when                                                                   |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `[README.md](README.md)`                                                   | Setup, scripts, layout, conventions; **macOS release signing** (Developer ID + notarization env vars) |
| `[docs/product.md](docs/product.md)`                                       | User-visible behavior and workflows                                        |
| `[docs/exif-preset-mapping.md](docs/exif-preset-mapping.md)`               | EXIF tags, preset merge order, Film/Keywords, AI behavior                  |


**Rule:** If you change something users see or EXIF/preset semantics, update `**docs/product.md`** and/or `**docs/exif-preset-mapping.md`** in the same change when appropriate.

## Repository layout


| Area                 | Role                                                                              |
| -------------------- | --------------------------------------------------------------------------------- |
| `install-mac-app`    | macOS: run `npm run build`, copy `release/EXIFmod.app` → `/Applications`          |
| `homebrew-exifmod/`  | Files to sync into [prettyoaktree/homebrew-exifmod](https://github.com/prettyoaktree/homebrew-exifmod); bump via `scripts/publish-homebrew-tap-release.sh` |
| `src/main/`          | IPC handlers, menus, ExifTool runner, Ollama `fetch`, `previewImage`, DB paths    |
| `src/main/exifCore/` | Merge/sanitize/write, SQL catalog                                                 |
| `src/renderer/`      | React UI (`App.tsx`, preset editor, panels)                                       |
| `src/preload/`       | `contextBridge` → `window.exifmod` — **only** exposed API surface to the renderer |
| `src/shared/`        | Types, `exifLimits`, `filmKeywords`, i18n helpers — safe for main + renderer      |
| `locales/`           | Nested JSON (`ui.*`, `menu.*`, …)                                                 |


Path aliases: `@shared` → `src/shared`, `@renderer` → `src/renderer/src` (see `electron.vite.config.ts`).

## Architecture rules

1. **Renderer** must not use Node `fs`, `child_process`, or raw `ipcRenderer`. Use `**window.exifmod`** (preload) for all privileged operations.
2. **New IPC:** Add handler in `src/main/index.ts`, method on `window.exifmod` in `src/preload/index.ts`, types in `src/renderer/src/vite-env.d.ts` (and `src/shared/types.ts` if needed).
3. **EXIF limits and merge helpers** belong in `src/shared/` (`exifLimits.ts`, `filmKeywords.ts`); keep main/renderer behavior aligned with those helpers.
4. **UI copy** goes through `**locales/en.json`** (and `**locales/fr.json`** for French). New locales require registering the base code in `src/shared/i18n/resolveLocale.ts`. Preserve `{{placeholders}}` in translations.

## Commands

```bash
npm install          # dependencies
npm run dev          # electron-vite + Electron
npm test             # vitest (run after behavioral changes)
npm run build        # tsc check, vite build, electron-builder
```

Prefer `**npm test**` before finishing a task that touches logic; use `**npm run build:vite**` for a quicker compile check without packaging.

## Major features and feature branches

For a **major update** or **new feature** (not small bugfixes, copy tweaks, or one-line fixes), **plans should explicitly state** that all development for that work happens on a **dedicated feature branch** (for example `feature/<short-name>`). Merge to the main integration branch when the feature is complete and reviewed.

**Why:** Keeps the default branch stable, isolates risky or long-running changes, and allows **multiple agents or developers** to implement different features **in parallel** on separate branches without sharing one working tree.

## Style and scope

- Match existing patterns in neighboring files (naming, error handling, React hooks).
- Keep diffs **focused** on the requested behavior; avoid drive-by refactors.
- Do not hand-edit `**out/`** or generated release artifacts.

## macOS / Electron notes

- Closing the **last main window quits the app** (custom `window-all-closed` behavior), not the default “stay in Dock with no windows.”
- Dev menu bar may show **Electron** until a packaged build; see README.

## Testing

- **Vitest** — unit tests near sources (e.g. `*.test.ts`), integration-style tests for ExifTool where applicable.
- Add or extend tests when changing pure helpers or merge rules with clear inputs/outputs.

