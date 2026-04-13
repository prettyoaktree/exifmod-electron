# EXIFmod — product overview

EXIFmod is a desktop application for photographers and editors who want to **apply consistent EXIF metadata** (camera, lens, film stock, author/copyright, exposure, and notes) across images using a **reusable preset catalog**, then **write those changes into the image files**.

The app is built with Electron; metadata read and write use **ExifTool** on the user’s machine.

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


You can **create** and **edit** presets from the **Manage Presets** panel. Preset names are unique within each category.

---

## Metadata mapping UI

For the current selection, the app shows **two** four-column tables: **Attribute**, **Current Value**, **New Value**, and **Remove**. The first table covers **Camera**, **Lens**, **Film**, **Author**, **Shutter Speed**, and **Aperture**. A titled subsection **Description and keywords** (same styling as other metadata headings) contains the **AI** control and optional **Start Ollama** drawer, followed by a second table with **Description** and **Keywords** rows using the same columns.

- **Current** — Values inferred from the file’s existing EXIF (where applicable). When there is no value, the cell shows an em dash (—).
- **New** — Pending edits. Preset pickers (or “None” / **Do Not Modify**) are **searchable**: type to filter the list, or open it with the chevron; **Tab** and **Arrow** keys still move between metadata fields when the list is closed.
- **Shutter and aperture** — Editable when not pinned by the selected **camera** preset. If the camera preset defines a fixed shutter and/or fixed aperture, the **New** column shows those values **read-only** (same idea as a fixed-lens body’s **Lens** row). Otherwise, values are edited here and validated before write (fractions or decimals for shutter; f-numbers for aperture). An empty **New** field with the **Do Not Modify** placeholder means **do not write** that tag for that file.
- **Description** and **Keywords** — Same table layout as the rows above. **Description** maps to EXIF **ImageDescription** (UTF‑8 byte limit enforced on write). **Keywords** are comma- or line-separated tokens merged with preset **Keywords** (film stock markers, deduplication, and total size limits apply). For both, an empty **New** field means **do not change** what is on the file (no manual write for that field from this row). The **AI** control uses each file’s **on-file** description when **New** is empty so the remaining byte budget matches what would be appended to.
- **Remove** — A **checkbox** per row (not a red ×) marks that value to be **cleared on the file** at the next write (ExifTool empty assignment). When **Remove** is checked, the **New** controls for that row are disabled for the selection. With **multiple files** selected, if every staged file shares the same remove choice, the checkbox is fully checked or unchecked; if they disagree, the checkbox shows the **indeterminate** (mixed) state—clicking it applies one choice to **all** selected files. Hover / focus still uses the **Remove from image** hint where applicable. The **Film** row clears **ISO** and film-identity **Keywords** tokens (marker `film`, `… Film Stock`, legacy stock hint) while leaving unrelated keywords. The checkbox is disabled when there is nothing on disk to remove for that row (or when shutter/aperture are read-only due to a fixed camera preset).

When multiple files are selected, the UI can show **Multiple** where values differ. For **Description** and **Keywords**, if the selected files do not all share the same text, the fields show **placeholders** that explain that typing applies one pending value to every selected file (overwriting differing values), while the **AI** control still **appends** to each file’s description and **merges** keywords (see below). Pending changes can target **all selected files** when you write.

### Optional local AI (Ollama)

On startup, EXIFmod **asynchronously** checks whether Ollama is reachable by sending a **minimal text chat** to the configured model (same host and model as real AI work). While that check runs, the **AI** control stays disabled and shows an **animated green border** (activity). If Ollama responds, the control switches to the steady green “available” styling (it may still be disabled until you select files or until there is room in Description). If the **`ollama`** command is **not** on your PATH (and the warmup failed), the **AI** control stays **off for the session** with a hint to install Ollama. Otherwise, if Ollama does not respond but the CLI is available, a **collapsible drawer** next to the AI button offers **Start Ollama** (`ollama serve`) without a modal; **Not now** collapses the drawer so you can reopen it later. Until you choose **Start Ollama**, the AI button stays **without** that animation; after you do, the **animated green border** returns until the server answers or a timeout is reached.

The **Description and keywords** subsection header offers the **AI** control when Ollama is available for the session and at least one staged file still has room for more ImageDescription text. It calls a **local Ollama** server over HTTP (`/api/chat`) with a downscaled JPEG preview per file. For **one** selected file, AI runs immediately. For **several** files, the app asks for confirmation, then processes files **one after another**, showing **Generating (n/total)…** on the button. **Per-file failures do not stop the batch**; when the run finishes, if anything failed, a dialog lists each error and you can **retry only the failed files** or dismiss. AI output **appends** to each file’s existing description (within the EXIF byte budget) and **merges** suggested **Keywords** with the field. Only **loopback** hosts are allowed (e.g. `127.0.0.1`). Configure the base URL and model with **`EXIFMOD_OLLAMA_HOST`** and **`EXIFMOD_OLLAMA_MODEL`** if needed. If a describe request fails with a **transport** error (for example **`fetch failed`** because Ollama stopped), the app re-checks availability and can show the **Start Ollama** drawer again when the CLI is on your PATH—without changing the initial startup check.

When you quit EXIFmod: if Ollama **was already running** when the app started (the warmup succeeded immediately), EXIFmod **does not** stop Ollama. If EXIFmod **started** **`ollama serve`** after you opted in, it **terminates** that process when you quit.

### Clipboard and menus

Use the **Edit** menu (or standard shortcuts such as **⌘C** / **Ctrl+C**, **⌘A** / **Ctrl+A**) to copy or select text in Description, Keywords, and the EXIF preview. On macOS, an Edit menu with standard roles is required for those shortcuts to apply to the web content.

**Help → Tutorial…** opens a short guided walkthrough of the main workflow. The first time you launch the app, that tutorial opens automatically; after you close or finish it, the app remembers not to show it again on startup. Developers can pass **`--simulate-first-run`** on the command line (for example with `npm run dev -- --simulate-first-run`) to open the same automatic tutorial without writing that “seen” flag—useful for testing the first-run experience repeatedly.

On macOS, **EXIFmod → About EXIFmod** opens the standard About window with the app icon, the same headline as the main window title bar area, release version **1.0.0**, and copyright **© 2026 Alon Yaffe, All Rights Reserved.**

---

## Manage Presets panel

The **Manage Presets** slide-out lists presets by category. When a category is expanded, a **filter** field above the list narrows names by substring (independent filter per category). Collapsing a category clears its filter.

---

## Import and export presets

From the **File** menu:

- **Import Preset Database…** — Merge presets from a previously exported EXIFmod SQLite database. Conflicts or invalid rows are reported; valid presets are imported.
- **Export Preset Database…** — Save the current preset database as `presets.sqlite3` to a folder you choose (useful for backup or moving to another machine).

---

## Startup checks (preflight)

On launch, the app verifies that the preset database is usable and that **ExifTool** can be found and executed. If something is wrong, the user sees a clear message (missing DB, no presets, ExifTool not on PATH, etc.).

---

## Localization

The interface language follows the **operating system** locale when a matching translation exists; otherwise it falls back to **English**. Strings are maintained as JSON files under `locales/` in the repository.

---

## Installing a macOS build from source

If you build **`EXIFmod.app`** from this repository, you can copy it to **`/Applications`** with the **`install-mac-app`** script at the repo root (it runs **`npm run build`** first). See **[README.md](../README.md)** (Getting started → **macOS: install a release build to `/Applications`**).

---

## Relationship to technical documentation

- `**[exif-preset-mapping.md](exif-preset-mapping.md)`** — Exact merge order, tag-level behavior, Film/Keywords, Author/Copyright formatting, and code references. Use it for implementation or deep EXIF questions.

---

## Maintenance

**Update this document** when user-visible behavior, workflows, or features change (new menus, new categories, different supported formats, import/export rules, etc.), so it stays accurate for users and contributors.