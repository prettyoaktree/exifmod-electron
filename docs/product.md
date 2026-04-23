# EXIFmod — product overview

EXIFmod is a desktop application for photographers and editors who want to **apply consistent EXIF metadata** (camera, lens, film stock, author/copyright, exposure, and notes) across images using a **reusable preset catalog**, then **write those changes into the image files**.

The app is built with Electron; metadata read and write use **ExifTool** on the user’s machine. Optional **local AI** (Ollama) can suggest descriptions and keywords from image previews.

---

## Who it is for

- People who batch-edit metadata with **saved combinations** (bodies, lenses, film stocks, author identity) instead of typing the same EXIF fields repeatedly.
- Workflows centered on a **folder of images**: open a folder, pick files, adjust metadata, commit.

---

## Core workflow

1. **Open a folder** (or launch from the OS with a supported image — see the README’s macOS notes). On a normal launch with no file/folder passed in, EXIFmod **reopens the last folder** you chose via **Open Folder** (stored in app data); if there is none, you see **Open Folder** until you pick one. The app lists **supported images** in that folder.
2. **Select one or more files** in the list. The main window is split edge-to-edge into **files** (list + preview) and **metadata**; narrow dividers between sections can be dragged to resize. The UI shows a **preview** (when one image is in focus) and a **metadata** area.
3. Choose **presets** per category and optionally set **shutter speed**, **aperture**, **Description** (EXIF `ImageDescription`), and **Keywords** (merged with preset keywords on write). Edits are **pending** until you commit.
4. Use **Preview EXIF Changes** to inspect **only the tags that would change** compared to each file’s current metadata (same logic as commit). If nothing would change for any file, the preview stays empty (shows “—”).
5. **Write Pending Changes** applies metadata only for files that actually differ; **Clear Pending Changes** discards uncommitted edits.

Supported image extensions in the file list and for OS “open with” flows include **JPEG** and **TIFF**, plus common **camera RAW** formats (see `RAW_IMAGE_EXTENSIONS` in `src/main/exifCore/constants.ts`). For RAW files, EXIFmod **writes metadata to an XMP sidecar** (`basename.xmp` next to the file) and does **not** rewrite the proprietary RAW container. For JPEG/TIFF, metadata is written **into** the file (with an optional backup copy before writing when you choose that in the confirmation dialog).

---

## Installation and updates

**Platforms, installers, Homebrew, winget, SmartScreen, and ExifTool on PATH** are documented in **[README.md](../README.md)**. In short:

- EXIFmod **requires** a working `**exiftool`** on your `PATH` for metadata I/O (installers and package managers typically pull it in—see the README).
- In **packaged** macOS and Windows builds, the app can **check GitHub Releases** for updates and **asks before downloading**; use **Help → Check for Updates…** or the **Updates** area in the status bar for a manual check. Development builds (`npm run dev`) do not auto-update.

---

## Preset catalog

Presets are stored in a **local SQLite database** (managed by the app). They are grouped into four categories:


| Category   | Typical use                                                                                                                                                                                                                                                                                     |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Camera** | Body make/model; lens system (**fixed** vs **interchangeable**). **Lens mount** and adapter compatibility apply only to interchangeable bodies; fixed-lens bodies may store optional integrated lens make/model instead. Optional **fixed shutter speed** and/or **fixed aperture** (DB flags; written as EXIF `ExposureTime` / `FNumber` only when enabled). |
| **Lens**   | Lens-oriented fields; the UI can filter lens choices using camera/lens metadata from the catalog.                                                                                                                                                                                               |
| **Film**   | Film stock and ISO; keywords are composed for EXIF (see [exif-preset-mapping.md](exif-preset-mapping.md)).                                                                                                                                                                                      |
| **Author** | Author identity and optional copyright text (copyright is formatted on write — see that doc).                                                                                                                                                                                                   |


On a **first launch** with an empty preset database, EXIFmod seeds the catalog from **bundled JSON** examples shipped in the app (then imports any additional `camera_*.json`, `lens_*.json`, `film_*.json`, or `author_*.json` files from your app **config** folder, if present). No default SQLite file is shipped. After the catalog has ever contained at least one preset, **deleting every preset** leaves the catalog empty and does **not** restore the bundled defaults (you can still add presets manually or drop JSON into the config folder). A full wipe of app data (see the README) restores true first-run behavior.

You can **create**, **edit**, and **delete** presets from the **Manage Presets** panel. Preset names are unique within each category. **Delete** removes the preset from the catalog only; it does not change metadata already written to image files. If you had pending edits using that preset, those selections are cleared for the affected category (back to **None** / **Do Not Modify** as appropriate).

Merge order, tag behavior, and implementation detail: **[exif-preset-mapping.md](exif-preset-mapping.md)**.

---

## Editing metadata

For the current selection, the app shows two metadata tables. The first table uses four columns: **Attribute**, **Current Value**, **New Value**, and **Remove** (Camera, Lens, Film, Author, Shutter Speed, Aperture). A subsection **Description and keywords** contains the AI control, followed by a second table with five columns: **Attribute**, **Current Value**, **Copy**, **New Value**, and **Remove**. **Start Ollama** and related hints live in the **Ollama** area of the bottom status bar (see **Status bar** below).

### Presets and fields

- **Current** — Values inferred from the file’s existing EXIF (where applicable). When there is no value, the cell shows an em dash (—). For Camera, Lens, Film, and Author, when the inferred value does **not** match any preset in your catalog, a **+** control appears beside the text; it opens **New Preset** with fields prefilled from the file (you still enter a preset name and save). For **Film**, if keywords imply a film stock but no catalog film was resolved, **Current** can show a derived stock name (and optional ISO) so it lines up with that flow. For a **new Camera** preset from file metadata, **Lens System** is a visible two-option control (interchangeable vs fixed); the draft still starts as interchangeable with body fields filled from EXIF, and if you switch to **Fixed**, integrated **Lens Make** / **Lens Model** can pre-fill from the file’s lens tags when present.
- **Camera-first matching (fixed-lens bodies)** — The app matches **Camera** (make/model) before **Lens**. If the file’s body matches a **fixed-lens** camera preset in the catalog, it also compares the file’s lens EXIF to that preset’s **integrated lens** identity (same derivation as the catalog). If the body matches but the integrated lens does **not**, the catalog does not fully describe the file: **Camera** shows **+** (create preset), and **Lens** preset matching from the file is skipped for that case. When body and integrated lens both match, **New → Camera** can auto-select that preset and **Lens** stays in the fixed-lens pattern (no separate lens preset row).
- **New** — Pending edits. While the app finishes reading the file and matching presets for the current selection, the **New** preset fields stay empty (not **Do Not Modify**) so you do not see a brief wrong default before auto-selection lands. When metadata **definitively matches** catalog presets (same identity rules as **Current**), the **New** column can **auto-select** those presets for Camera/Lens/Film/Author so the row reflects an already-aligned catalog choice; Film and Author matching are always evaluated independently of fixed vs interchangeable camera. When you **Save** in **New Preset** or **Edit Preset**, that preset is applied to the file or files that were staged when you **opened** the dialog for its category, then the catalog refreshes (auto-matching from file metadata still applies afterward where rules allow). This stays correct if you move the file-list focus or change selection while the dialog is open. Preset pickers (or “None” / **Do Not Modify**) are **searchable**: type to filter the list, or open it with the chevron; **Tab** and **Arrow** keys still move between metadata fields when the list is closed.
- **Shutter and aperture** — Editable when not pinned by the selected **camera** preset. If the camera preset defines a fixed shutter and/or fixed aperture, the **New** column shows those values **read-only** (same idea as a fixed-lens body’s **Lens** row). Otherwise, values are edited here and validated before write (fractions or decimals for shutter; f-numbers for aperture). An empty **New** field with the **Do Not Modify** placeholder means **do not write** that tag for that file.

### Description and keywords

- **Description** maps to EXIF **ImageDescription** (UTF‑8 byte limit enforced on write).
- The **New Keywords** textarea shows **descriptive-only** tokens (comma- or line-separated); film-identifying keywords (`film`, `… Film Stock`, legacy stock hints) are **not** shown there—they are still merged from the Film preset and/or the file’s existing keywords on **write**, with deduplication and total size limits. For both Description and Keywords, an empty **New** field means **do not change** what is on the file (no manual write for that field from this row).
- **Copy** (Description/Keywords rows) — Copies the row’s **Current Value** into **New Value**. The copy control is shown only when copying is allowed (single usable current value for the selection; not when Current shows **Multiple**). For Keywords, **Copy** fills **New** with descriptive tokens only; film identity remains handled automatically at write (same as refresh and AI flows).

### Remove and multi-select

- **Remove** — A **checkbox** per row marks that value to be **cleared on the file** at the next write (ExifTool empty assignment). When **Remove** is checked, the **New** controls for that row are disabled for the selection.
- With **multiple files** selected, if every staged file shares the same remove choice, the checkbox is fully checked or unchecked; if they disagree, the checkbox shows the **indeterminate** (mixed) state—clicking it applies one choice to **all** selected files. Hover / focus still uses the **Remove from image** hint where applicable.
- The **Film** row clears **ISO** and film-identity **Keywords** tokens (marker `film`, `… Film Stock`, legacy stock hint) while leaving unrelated keywords. The checkbox is disabled when there is nothing on disk to remove for that row (or when shutter/aperture are read-only due to a fixed camera preset).

When multiple files are selected, the UI can show **Multiple** where values differ. For Camera, Lens, Film, and Author, if **Current** is **Multiple** for a row, the app does **not** run catalog preset matching for that category (**New** stays **Do Not Modify** for that row, saving work). If **every** one of those rows is **Multiple** at once, the app skips the per-file preset matcher entirely for that selection (no redundant work). For **Description** and **Keywords**, if the selected files do not all share the same text, the fields show placeholders explaining that typing applies one pending value to every selected file (overwriting differing values). Pending changes can target all selected files when you write.

---

## Optional local AI (Ollama)

EXIFmod can call a **local Ollama** server over HTTP to suggest **Description** and **Keywords** from downscaled JPEG previews (a smaller 384px-long-edge image is sent to the model; the on-screen file preview stays at 640px). You need **Ollama** with at least one **vision** model. The app uses the model name **`**gemma4**`** by default, or the name in **`**EXIFMOD_OLLAMA_MODEL**`** if you set that variable. The **Generative AI (Ollama)** status bar panel can show and **edit** the **system prompt** (saved under app data; it must include the literal token `{{MAX_DESC_BYTES}}` so the app can substitute the per-file description byte cap). You can set `**EXIFMOD_OLLAMA_HOST**` (loopback only; default `**http://127.0.0.1:11434**`). On startup the app checks reachability; if Ollama is not running, use the **Ollama** segment in the **status bar** to start `**ollama serve**` when prompted. When a describe run **finishes**, a short **completion line** can appear in that panel; the panel does **not** open automatically.

For one selected file, AI runs immediately; for several files, the app asks for confirmation, then processes sequentially. Per-file failures do not stop the batch. When you quit EXIFmod: if Ollama **was already running** when the app started, EXIFmod **does not** stop it; if EXIFmod **started** `**ollama serve`** after you opted in, it **terminates** that process on quit.

If you try to close the app while there are **pending metadata changes** that would alter files on write, EXIFmod shows a confirmation dialog.

---

## Clipboard, menus, and help

Use the **Edit** menu (or **⌘C** / **Ctrl+C**, **⌘A** / **Ctrl+A**) to copy or select text in Description, Keywords, and the EXIF preview. On macOS, an Edit menu with standard roles is required for those shortcuts in the web content.

**Help → Tutorial…** opens a short guided walkthrough; the first launch may open it automatically until dismissed. Developers can use `**--simulate-first-run`** (e.g. `npm run dev -- --simulate-first-run`) to test without persisting the “seen” flag.

To **fully reset** local app storage, quit and launch once with `**--reset-app-data`** (see the README). You can combine `**--reset-app-data**` and `**--simulate-first-run**` for a clean slate plus first-run tutorial.

On packaged macOS and Windows builds, **Help → Check for Updates…** matches the **Updates** flow in the status bar.

On macOS, **EXIFmod → About EXIFmod** shows version and copyright **© 2026 EXIFmod, All Rights Reserved.**

---

## Lightroom Classic (JPEG and TIFF)

EXIFmod writes metadata **into** each image file; it does **not** create separate `.xmp` sidecars for JPEG or TIFF. Lightroom Classic usually stores **develop (editing) settings** in the same file as embedded XMP **Camera Raw** data, not next to the file.

Before you write from EXIFmod, if you rely on Lightroom’s catalog matching what is on disk, use **Metadata → Save Metadata to File** in Lightroom Classic. After EXIFmod has written tags, use **Metadata → Read Metadata from File** only when you intentionally want Lightroom to **reload metadata from the file** into the catalog—doing so can overwrite or clash with catalog-only state you expected.

Launches from the official **EXIFmod Open** plug-in (with a special session marker) show a one-time **Develop Snapshot** tip after the folder opens, with an option to stop showing it for future launches from Lightroom.

For JPEG/TIFF in-place writes, you can optionally create a **backup copy** in the same folder before ExifTool runs; the write confirmation dialog can remember that choice. **Help → Reset Remembered Prompts…** clears those choices (and the Lightroom snapshot tip suppression) so dialogs appear again.

**Help → Install Lightroom Classic Plugin…** installs the bundled plug-in into Adobe’s **Modules** folder. In Lightroom use **File → Plug-in Manager** to enable it, then **Library → Plug-in Extras → Open in EXIFmod** to open the selected photo in EXIFmod.

**Implementation detail** (dev builds, `open -n`, `LrShell`, paths): **[architecture.md](architecture.md#lightroom-classic-plugin-technical)**.

---

## Manage Presets panel

The **Manage Presets** slide-out lists presets by category. When a category is expanded, a **filter** field above the list narrows names by substring (independent filter per category). Collapsing a category clears its filter.

Below the category lists, **Unused lens mounts** appears only when relevant: while that list is loading, if it failed to load, or when there is at least one unused mount. When shown, it is expandable like the other categories and lists mount names that appear in your camera presets but not in any lens preset; you can remove them safely. Clearing a name updates affected camera presets only; it does not change image files. Suggested mount strings also come from the optional `lens_mount_defaults.json` file in app data—those entries are not listed here.

---

## Import and export presets

From the **File** menu:

- **Import Preset Database…** — Merge presets from a previously exported EXIFmod SQLite database. Conflicts or invalid rows are reported; valid presets are imported.
- **Export Preset Database…** — Save the current preset database to a file you name (default suggestion `presets.sqlite3`; useful for backup or moving to another machine).

---

## Status bar

Along the bottom of the main window, **Application** (readiness, ExifTool, preset catalog), optional **Ollama**, and—on packaged macOS and Windows—**Updates** each show a **status indicator**, a short label, and an optional **detail panel** for explanations and actions (for example starting Ollama or downloading an update). On launch, blocking problems (such as missing ExifTool) can open the Application detail automatically.

Full **conditions → lights → messages → actions** matrix: **[status-footer.md](status-footer.md)**.

---

## Localization

The interface language follows the **operating system** locale when a matching translation exists; otherwise it falls back to **English**. Strings are maintained as JSON files under `locales/` in the repository.

---

## For contributors and developers

- **[README.md](../README.md)** — Install from releases, build from source, dev commands, reset flags.
- **[architecture.md](architecture.md)** — IPC, preload, packaging, macOS Open With, Lightroom plugin internals.
- **[exif-preset-mapping.md](exif-preset-mapping.md)** — EXIF merge order and tag behavior.
- **[status-footer.md](status-footer.md)** — Status bar; update when footer behavior changes.