# EXIFmod — product overview

EXIFmod is a desktop application for photographers and editors who want to **apply consistent EXIF metadata** (camera, lens, film stock, author/copyright, exposure, and notes) across images using a **reusable preset catalog**, then **write those changes into the image files**.

The app is built with Electron; metadata read and write use **ExifTool** on the user’s machine.

### Install on macOS (Homebrew)

You can install a release build with the **[homebrew-exifmod](https://github.com/prettyoaktree/homebrew-exifmod)** tap:

```bash
brew tap prettyoaktree/homebrew-exifmod
brew install --cask exifmod
```

The cask installs Homebrew’s **`exiftool`** formula as well; EXIFmod still **requires** a working `exiftool` on your `PATH` for metadata I/O.

The cask **downloads the installer DMG** from the public **[exifmod-electron](https://github.com/prettyoaktree/exifmod-electron)** app repository’s [GitHub Releases](https://github.com/prettyoaktree/exifmod-electron/releases) (the tap repository still hosts the Homebrew formula and cask metadata).

Homebrew here is primarily a **bootstrap/install** path. After installation, EXIFmod’s built-in updater can advance the app version independently of Homebrew’s originally installed cask metadata.

### Install on Windows

Download the **NSIS installer** from the app repository’s [GitHub Releases](https://github.com/prettyoaktree/exifmod-electron/releases). **ExifTool** is not bundled: install it separately and ensure **`exiftool`** is on your **PATH** (then restart EXIFmod if it was already running). The README lists typical install options.

### Automatic updates (release app, macOS and Windows)

In the **packaged release** app (signed **macOS** build or **Windows** installer from releases), EXIFmod periodically checks **[GitHub Releases](https://github.com/prettyoaktree/exifmod-electron/releases)** for a newer version. When an update is available, you are prompted before anything is downloaded. After the download finishes, you can **restart to install**. Development builds (`npm run dev`) do not perform automatic updates.

You can also choose **Help → Check for Updates…** at any time.

Because of this split model on macOS (Homebrew install + in-app update), `brew upgrade` is not always the canonical indicator of the currently installed EXIFmod version once auto-update has run.

---

## Who it is for

- People who batch-edit metadata with **saved combinations** (bodies, lenses, film stocks, author identity) instead of typing the same EXIF fields repeatedly.
- Workflows centered on a **folder of images**: open a folder, pick files, adjust metadata, commit.

---

## Core workflow

1. **Open a folder** (or launch from the OS with a supported image — see the README’s macOS notes). The app lists **supported images** in that folder.
2. **Select one or more files** in the list. The main window is split edge-to-edge into **files** (list + preview) and **metadata**; narrow dividers between sections can be dragged to resize. The UI shows a **preview** (when one image is in focus) and a **metadata** area.
3. Choose **presets** per category and optionally set **shutter speed**, **aperture**, **Description** (EXIF `ImageDescription`), and **Keywords** (merged with preset keywords on write). Edits are **pending** until you commit.
4. Use **Preview EXIF Changes** to inspect **only the tags that would change** compared to each file’s current metadata (same logic as commit). If nothing would change for any file, the preview stays empty (shows “—”).
5. **Write Pending Changes** applies metadata only for files that actually differ; **Clear Pending Changes** discards uncommitted edits.

Supported image extensions in the file list and for OS “open with” flows: `**.jpg`**, `**.jpeg**`, `**.tif**`, `**.tiff**`.

---

## Preset catalog

Presets are stored in a **local SQLite database** (managed by the app). They are grouped into four categories:


| Category   | Typical use                                                                                                                           |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| **Camera** | Body make/model; lens system (fixed vs interchangeable), mount, adapter compatibility; optional lens make/model on fixed-lens bodies; optional **fixed shutter speed** and/or **fixed aperture** (stored with explicit DB flags; written as EXIF `ExposureTime` / `FNumber` only when enabled). |
| **Lens**   | Lens-oriented fields; the UI can filter lens choices using camera/lens metadata from the catalog.                                     |
| **Film**   | Film stock and ISO; keywords are composed for EXIF (see technical doc).                                                               |
| **Author** | Author identity and optional copyright text (copyright is formatted on write — see technical doc).                                    |


On a **first launch** with an empty preset database, EXIFmod seeds the catalog from **bundled JSON** examples shipped in the app (then imports any additional `camera_*.json`, `lens_*.json`, `film_*.json`, or `author_*.json` files from your app **config** folder, if present). No default SQLite file is shipped. After the catalog has ever contained at least one preset, **deleting every preset** leaves the catalog empty and does **not** restore the bundled defaults (you can still add presets manually or drop JSON into the config folder). A full wipe of app data (see the README) restores true first-run behavior.

You can **create**, **edit**, and **delete** presets from the **Manage Presets** panel. Preset names are unique within each category. **Delete** removes the preset from the catalog only; it does not change metadata already written to image files. If you had pending edits using that preset, those selections are cleared for the affected category (back to **None** / **Do Not Modify** as appropriate).

---

## Metadata mapping UI

For the current selection, the app shows two metadata tables. The first table uses four columns: **Attribute**, **Current Value**, **New Value**, and **Remove** (Camera, Lens, Film, Author, Shutter Speed, Aperture). A titled subsection **Description and keywords** contains the AI control, followed by a second table with five columns for Description/Keywords rows: **Attribute**, **Current Value**, **Copy**, **New Value**, and **Remove**. **Start Ollama** and related hints live in the **Ollama** area of the bottom status bar (see **Status bar** below).

- **Current** — Values inferred from the file’s existing EXIF (where applicable). When there is no value, the cell shows an em dash (—).
- **New** — Pending edits. Preset pickers (or “None” / **Do Not Modify**) are **searchable**: type to filter the list, or open it with the chevron; **Tab** and **Arrow** keys still move between metadata fields when the list is closed.
- **Shutter and aperture** — Editable when not pinned by the selected **camera** preset. If the camera preset defines a fixed shutter and/or fixed aperture, the **New** column shows those values **read-only** (same idea as a fixed-lens body’s **Lens** row). Otherwise, values are edited here and validated before write (fractions or decimals for shutter; f-numbers for aperture). An empty **New** field with the **Do Not Modify** placeholder means **do not write** that tag for that file.
- **Description** and **Keywords** — **Description** maps to EXIF **ImageDescription** (UTF‑8 byte limit enforced on write). The **New Keywords** textarea shows **descriptive-only** tokens (comma- or line-separated); film-identifying keywords (`film`, `… Film Stock`, legacy stock hints) are **not** shown there—they are still merged from the Film preset and/or the file’s existing keywords on **write**, with deduplication and total size limits. For both Description and Keywords, an empty **New** field means **do not change** what is on the file (no manual write for that field from this row).
- **Copy** (Description/Keywords rows) — Copies the row’s **Current Value** into **New Value**. Enabled only when the current value is a single usable value for the selection (disabled when Current shows **Multiple**). For Keywords, **Copy** fills **New** with descriptive tokens only; film identity remains handled automatically at write (same as refresh and AI flows).
- **Remove** — A **checkbox** per row (not a red ×) marks that value to be **cleared on the file** at the next write (ExifTool empty assignment). When **Remove** is checked, the **New** controls for that row are disabled for the selection. With **multiple files** selected, if every staged file shares the same remove choice, the checkbox is fully checked or unchecked; if they disagree, the checkbox shows the **indeterminate** (mixed) state—clicking it applies one choice to **all** selected files. Hover / focus still uses the **Remove from image** hint where applicable. The **Film** row clears **ISO** and film-identity **Keywords** tokens (marker `film`, `… Film Stock`, legacy stock hint) while leaving unrelated keywords. The checkbox is disabled when there is nothing on disk to remove for that row (or when shutter/aperture are read-only due to a fixed camera preset).

When multiple files are selected, the UI can show **Multiple** where values differ. For **Description** and **Keywords**, if the selected files do not all share the same text, the fields show placeholders explaining that typing applies one pending value to every selected file (overwriting differing values). Pending changes can target all selected files when you write.

### Optional local AI (Ollama)

On startup, EXIFmod **asynchronously** checks whether Ollama is reachable by sending a **minimal text chat** to the configured model (same host and model as real AI work). While that check runs, the **AI** control stays disabled and the **spark icon’s color** pulses between muted and full-contrast (no button border or fill). If Ollama responds, the control settles to normal **enabled** styling (darker icon when it can run) or **disabled** dimming when it cannot (for example no files selected or no room in Description). If the **`ollama`** command is **not** on your PATH (and the warmup failed), the **AI** control stays **off for the session** with a hint to install Ollama. Otherwise, if Ollama does not respond but the CLI is available, open the **Ollama** segment in the **status bar** to use **Start Ollama** (`ollama serve`), or close the panel if you want to defer. Until you choose **Start Ollama**, the AI button stays **without** that animation; after you do, the **color pulse** returns until the server answers or a timeout is reached.

The **Description and keywords** subsection header offers the **AI** control when Ollama is available for the session and at least one staged file still has room for more pending ImageDescription text. It calls a local Ollama server over HTTP (`/api/chat`) with a downscaled JPEG preview per file. For one selected file, AI runs immediately. For several files, the app asks for confirmation, then processes files one after another, showing **Generating (n/total)…** on the button. Per-file failures do not stop the batch; when the run finishes, if anything failed, a dialog lists each error and you can retry only the failed files or dismiss. AI output appends to each file’s pending **New** Description and appends suggested keywords to the **descriptive** pending **New** Keywords list (with dedupe); the textarea stays film-free. Film-identifying tokens already on file (`film`, `… Film Stock`) are still merged into the **write** payload even if they do not appear in the New Keywords field. Only loopback hosts are allowed (e.g. `127.0.0.1`). Configure the base URL and model with **`EXIFMOD_OLLAMA_HOST`** and **`EXIFMOD_OLLAMA_MODEL`** if needed. If a describe request fails with a transport error (for example `fetch failed` because Ollama stopped), the app re-checks availability and can show the Start Ollama drawer again when the CLI is on your PATH, without changing the initial startup check.

When you quit EXIFmod: if Ollama **was already running** when the app started (the warmup succeeded immediately), EXIFmod **does not** stop Ollama. If EXIFmod **started** **`ollama serve`** after you opted in, it **terminates** that process when you quit.

If you try to close the app while there are **pending metadata changes** that would alter files on write (same condition as **Write Pending Changes** being enabled), EXIFmod shows a confirmation dialog; you can cancel to stay in the app or quit and discard those edits.

### Clipboard and menus

Use the **Edit** menu (or standard shortcuts such as **⌘C** / **Ctrl+C**, **⌘A** / **Ctrl+A**) to copy or select text in Description, Keywords, and the EXIF preview. On macOS, an Edit menu with standard roles is required for those shortcuts to apply to the web content.

**Help → Tutorial…** opens a short guided walkthrough of the main workflow. The first time you launch the app, that tutorial opens automatically; after you close or finish it, the app remembers not to show it again on startup. Developers can pass **`--simulate-first-run`** on the command line (for example with `npm run dev -- --simulate-first-run`) to open the same automatic tutorial without writing that “seen” flag—useful for testing the first-run experience repeatedly.

To **fully reset** local app storage (preset SQLite, `config` JSON presets, tutorial and LRC snapshot flags, last image folder choice, and any other files under Electron’s **user data** directory for EXIFmod), quit the app and launch once with **`--reset-app-data`** (see the README “Reset all app data” section). You can combine **`--reset-app-data`** and **`--simulate-first-run`** to approximate a clean install plus first-run tutorial in one launch.

On **macOS** and **Windows** packaged builds, **Help → Check for Updates…** runs the same update check as the **Updates** area in the status bar (progress and results appear there). It queries GitHub Releases for a newer release (macOS builds are **signed**; Windows builds follow the same feed—see **Automatic updates** above).

On macOS, **EXIFmod → About EXIFmod** opens the standard About window with the app icon, the same headline as the main window title bar area, the **version of the build you are running** (from the app bundle), and copyright **© 2026 EXIFmod, All Rights Reserved.**

### Lightroom Classic (JPEG and TIFF)

EXIFmod writes metadata **into** each image file; it does **not** create separate `.xmp` sidecars for JPEG or TIFF. Lightroom Classic usually stores **develop (editing) settings** in the same file as embedded XMP **Camera Raw** data, not next to the file.

Before you write from EXIFmod, if you rely on Lightroom’s catalog matching what is on disk, use **Metadata → Save Metadata to File** in Lightroom Classic so the file contains the latest develop recipe and descriptive metadata. After EXIFmod has written tags, use **Metadata → Read Metadata from File** only when you intentionally want Lightroom to **reload metadata from the file** into the catalog—doing so can overwrite or clash with catalog-only state you expected.

When your pending write includes at least one file that still has Camera Raw develop metadata (`HasSettings` in ExifTool terms), the write confirmation dialog adds a short reminder with this guidance, including a recommendation to create a **Develop Snapshot** in Lightroom Classic first if you expect to use **Read Metadata from File** afterward (so you can re-apply develop settings from a snapshot if needed). **Exception:** launches that use the official **EXIFmod Open** / **EXIFmod Open (Dev)** plug-ins pass a special **`--exifmod-from-lrc`** marker; EXIFmod shows a one-time (per session) **Develop Snapshot** tip after the folder opens instead, and **omits** those extra write-confirmation paragraphs for that session—because the tip already covered the same guidance.

On macOS, **Help → Install Lightroom Classic Plugin…** copies the bundled **EXIFmod Open** Lightroom plug-in into Adobe’s **Modules** folder (replacing any previous copy so you can upgrade). From an **unpacked dev build** (`npm run dev`), the same command also installs a second plug-in, **EXIFmod Open (Dev)**, which uses Lightroom’s **`LrShell.openPathsViaCommandLine`** to run **`/usr/bin/open -n -a <node_modules/electron/dist/Electron.app> --args --exifmod-from-lrc <absolute-repo-root>`** plus the image file (**`-n`** starts a short-lived second process so Electron can emit **`second-instance`** to the running app with full argv; without **`-n`**, macOS often only activates the app and the image path never reaches EXIFmod) (see the Lightroom Classic SDK’s `LrShell` reference). The release plug-in uses the same **`open`** pattern with **`/Applications/EXIFmod.app`** and **`--exifmod-from-lrc`**. Finder and other **Open With** flows do **not** add that marker. Use **Library → Plug-in Extras → Open in EXIFmod Dev** for the dev flow; **Open in EXIFmod** still defaults to **`/Applications/EXIFmod.app`** (or a path you set in the plug-in’s preferences). From a **packaged release app**, only **EXIFmod Open** is installed. Then in Lightroom Classic use **File → Plug-in Manager** if you need to enable the plug-in(s). Run the command from **Library → Plug-in Extras → Open in EXIFmod** (or **Open in EXIFmod Dev** when installed) to open the selected photo’s file in EXIFmod (same folder session and file selection as opening the file from the desktop).

---

## Manage Presets panel

The **Manage Presets** slide-out lists presets by category. When a category is expanded, a **filter** field above the list narrows names by substring (independent filter per category). Collapsing a category clears its filter.

---

## Import and export presets

From the **File** menu:

- **Import Preset Database…** — Merge presets from a previously exported EXIFmod SQLite database. Conflicts or invalid rows are reported; valid presets are imported.
- **Export Preset Database…** — Save the current preset database to a file you name (default suggestion `presets.sqlite3`; useful for backup or moving to another machine).

---

## Startup checks (preflight)

On launch, the app verifies that the preset database is usable and that **ExifTool** can be found and executed. Results appear under **Application** in the **status bar** (see **Status bar** below): a neutral indicator while checks run, then green when ready or red with details if something blocks metadata work.

---

## Status bar (system health)

The main window includes a **status bar** along the bottom for **Application** readiness (preload bridge, **ExifTool**, preset catalog), **Ollama** (optional local AI), and—on **packaged macOS and Windows** release builds—**Updates**. Each area uses the same pattern: a **status indicator** (color reflects health or progress), a short label, and a **detail panel** you can open for explanations and actions (for example, starting Ollama or downloading an update).

While startup checks are still running, the **Application** indicator stays **neutral** until verification finishes, so you are not interrupted on a healthy machine. If a **blocking** problem is detected after those checks complete (for example ExifTool missing), the Application detail opens automatically and stays open until the situation is resolved or no longer applies.

Contributors: the full **conditions → lights → copy → actions** matrix lives in [`status-footer.md`](status-footer.md); update it whenever this surface changes.

---

## Localization

The interface language follows the **operating system** locale when a matching translation exists; otherwise it falls back to **English**. Strings are maintained as JSON files under `locales/` in the repository.

---

## Installing a macOS build from source

If you build **`EXIFmod.app`** from this repository, you can copy it to **`/Applications`** with the **`install-mac-app`** script at the repo root (it runs **`npm run build`** first). See **[README.md](../README.md)**.

---

## Relationship to technical documentation

- `**[exif-preset-mapping.md](exif-preset-mapping.md)`** — Exact merge order, tag-level behavior, Film/Keywords, Author/Copyright formatting, and code references. Use it for implementation or deep EXIF questions.

---

## Maintenance

**Update this document** when user-visible behavior, workflows, or features change (new menus, new categories, different supported formats, import/export rules, etc.), so it stays accurate for users and contributors.