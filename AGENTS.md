# Agent guide — EXIFmod

Concise instructions for AI coding agents and automated assistants working in this repository.

## What this project is

**EXIFmod** is an **Electron** desktop app for editing **EXIF** metadata using a **preset catalog** stored in **SQLite** (via **sql.js**). The main process runs **ExifTool** for read/write. The renderer is **React** (Vite) with **i18next**; strings live in `**locales/`**.

Optional **Ollama** integration calls a **local** HTTP server (`ollamaDescribeImage`, `ollama:listVisionModels` / `ollama:getModelSelection` / `ollama:setModel`, cached startup warmup, uncached `**ollamaCheckAvailability`** after describe transport failures, inline `**ollamaTryStartServer`** when the user starts `**ollama serve`** from the UI); EXIFmod does **not** bundle Ollama.

## Authoritative docs (read before risky changes)


| Document                                                     | Use when                                                                                                                                                              |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `[README.md](README.md)`                                     | User-facing overview, install, dev quickstart, links to deeper docs                                                                                                   |
| `[docs/architecture.md](docs/architecture.md)`               | Technical layout, IPC/preload boundaries, packaging/releases pointers                                                                                                 |
| `[docs/product.md](docs/product.md)`                         | User-visible behavior and workflows                                                                                                                                   |
| `[docs/exif-preset-mapping.md](docs/exif-preset-mapping.md)` | EXIF tags, preset merge order, Film/Keywords, AI behavior                                                                                                             |
| `[docs/status-footer.md](docs/status-footer.md)`             | Bottom status bar: conditions → lights → messages → actions; **update when** changing startup health, Ollama surfacing, auto-update UX, or adding new footer segments |


**Maintainer-only:** see `[maintainer.md](maintainer.md)` for Apple signing, notarization, and GitHub Actions setup (checklists and secret *names* only—never commit real credentials in git).

**Shipping a release (agents):** follow the Cursor project skill `[.cursor/skills/exifmod-release/SKILL.md](.cursor/skills/exifmod-release/SKILL.md)` so `package.json` version, git tag `vX.Y.Z`, GitHub Release assets (updater + DMG), release notes, Homebrew cask, and staged **winget** manifests under `winget/manifests/` stay aligned.

**Rule:** If you change something users see or EXIF/preset semantics, update `**docs/product.md`** and/or `**docs/exif-preset-mapping.md`** in the same change when appropriate. If you change **status footer** behavior or add environment checks that belong in the footer, update `**docs/status-footer.md`** in the same change.

## Repository layout


| Area                 | Role                                                                                                                                                                                                                                                                               |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `install-mac-app`    | macOS: run `npm run build`, copy `release/EXIFmod.app` → `/Applications`                                                                                                                                                                                                           |
| `homebrew-exifmod/`  | Tap mirror; `scripts/publish-homebrew-tap-release.sh` reads `version` from `package.json`, pulls the DMG from [exifmod-electron releases](https://github.com/prettyoaktree/exifmod-electron/releases), bumps the cask PR on the tap repo, optionally prunes older **tap** releases |
| `src/main/`          | IPC handlers, menus, ExifTool runner, Ollama `fetch`, `previewImage`, DB paths                                                                                                                                                                                                     |
| `src/main/exifCore/` | Merge/sanitize/write, SQL catalog                                                                                                                                                                                                                                                  |
| `src/renderer/`      | React UI (`App.tsx`, preset editor, panels)                                                                                                                                                                                                                                        |
| `src/preload/`       | `contextBridge` → `window.exifmod` — **only** exposed API surface to the renderer                                                                                                                                                                                                  |
| `src/shared/`        | Types, `exifLimits`, `filmKeywords`, i18n helpers — safe for main + renderer                                                                                                                                                                                                       |
| `locales/`           | Nested JSON (`ui.`*, `menu.`*, …)                                                                                                                                                                                                                                                  |


Path aliases: `@shared` → `src/shared`, `@renderer` → `src/renderer/src` (see `electron.vite.config.ts`).

## Architecture rules

1. **Renderer** must not use Node `fs`, `child_process`, or raw `ipcRenderer`. Use `**window.exifmod`** (preload) for all privileged operations.
2. **New IPC:** Add handler in `src/main/index.ts`, method on `window.exifmod` in `src/preload/index.ts`, types in `src/renderer/src/vite-env.d.ts` (and `src/shared/types.ts` if needed).
3. **EXIF limits and merge helpers** belong in `src/shared/` (`exifLimits.ts`, `filmKeywords.ts`); keep main/renderer behavior aligned with those helpers.
4. **UI copy** goes through `**locales/en.json`** (and `**locales/fr.json`** for French). New locales require registering the base code in `src/shared/i18n/resolveLocale.ts`. Preserve `{{placeholders}}` in translations.
  **English headline copy (Title Case):** Strings used as **modal headings**, **panel chrome titles** (metadata header, preset editor header, status footer `panelTitle`, etc.), **native dialog titles**, **tutorial step titles**, and similar short headlines should use **Title Case** in `locales/en.json`. Do **not** apply this to body paragraphs, hints, errors, or long explanations.
   **Exception — CSS forces ALL CAPS:** Some labels are shown in uppercase via `text-transform: uppercase` in `[src/renderer/src/App.css](src/renderer/src/App.css)` (e.g. `table.mapping thead th`, `.meta-section h2`, `.meta-subsection-title`, `.exif-preview-toggle`, `.preset-slideout-cat-title`). Source strings for those elements are still uppercased in the UI regardless of JSON casing; do not “fix” them for Title Case unless you are changing actual wording.
   **French:** Use French sentence-style capitalization in `locales/fr.json` for the same keys; do not mirror English Title Case mechanically.

## Commands

```bash
npm install          # dependencies
npm run dev          # electron-vite + Electron
npm test             # vitest (+ locale key check); run after logic / i18n key changes
npm run build:vite   # tsc + vite production build — default compile check (no packaging)
npm run build        # full pipeline: tsc, vite build, electron-builder (packaging/signing)
```

**Agents:** Do **not** run `**npm run build**` (the full electron-builder pipeline) unless the user **explicitly** asks for a full build or release packaging. For verification, run `**npm test**` when behavior or shared helpers change, and `**npm run build:vite**` when you need a compile/typecheck without packaging.

## Release tagging

- For the full ordered checklist (bump, tag, CI, assets, Homebrew), use `[.cursor/skills/exifmod-release/SKILL.md](.cursor/skills/exifmod-release/SKILL.md)`.
- When asked to tag and push a release, use the existing tag format `vX.Y.Z` (for example `v1.3.2`).
- After pushing the tag, **always** create GitHub release notes for that tag in the same workflow (via `gh release create` if missing, or `gh release edit` to update).
- Include concise highlights and the commit range / key commits since the previous release tag.

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

