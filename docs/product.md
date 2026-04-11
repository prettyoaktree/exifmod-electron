# ExifMod — product overview

ExifMod is a desktop application for photographers and editors who want to **apply consistent EXIF metadata** (camera, lens, film stock, author/copyright, exposure, and notes) across images using a **reusable preset catalog**, then **write those changes into the image files**.

The app is built with Electron; metadata read and write use **ExifTool** on the user’s machine.

---

## Who it is for

- People who batch-edit metadata with **saved combinations** (bodies, lenses, film stocks, author identity) instead of typing the same EXIF fields repeatedly.
- Workflows centered on a **folder of images**: open a folder, pick files, adjust metadata, commit.

---

## Core workflow

1. **Open a folder** (or launch from the OS with a supported image — see the README’s macOS notes). The app lists **supported images** in that folder.
2. **Select one or more files** in the list. The UI shows a **preview** (when one image is in focus) and a **metadata** area.
3. Choose **presets** per category and optionally set **shutter speed**, **aperture**, **Notes** (EXIF `ImageDescription`), and **Keywords** (merged with preset keywords on write). Edits are **pending** until you commit.
4. Use **Preview EXIF Changes** to inspect **only the tags that would change** compared to each file’s current metadata (same logic as commit). If nothing would change for any file, the preview stays empty (shows “—”).
5. **Write Pending Changes** applies metadata only for files that actually differ; **Clear Pending Changes** discards uncommitted edits.

Supported image extensions in the file list and for OS “open with” flows: `**.jpg`**, `**.jpeg**`, `**.tif**`, `**.tiff**`.

---

## Preset catalog

Presets are stored in a **local SQLite database** (managed by the app). They are grouped into four categories:


| Category   | Typical use                                                                                                                           |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| **Camera** | Body make/model; lens system (fixed vs interchangeable), mount, adapter compatibility; optional lens make/model on fixed-lens bodies. |
| **Lens**   | Lens-oriented fields; the UI can filter lens choices using camera/lens metadata from the catalog.                                     |
| **Film**   | Film stock and ISO; keywords are composed for EXIF (see technical doc).                                                               |
| **Author** | Author identity and optional copyright text (copyright is formatted on write — see technical doc).                                    |


You can **create** and **edit** presets from the **Manage Presets** panel. Preset names are unique within each category.

---

## Metadata mapping UI

For the current selection, the app shows a **metadata mapping** table:

- **Current** — Values inferred from the file’s existing EXIF (where applicable).
- **Preset** — The preset (or “None” / “Do Not Modify”) applied per category for **pending** edits.
- **Shutter and aperture** — Editable fields validated before write (fractions or decimals for shutter; f-numbers for aperture).
- **Notes** — Maps to EXIF **ImageDescription** (UTF‑8 byte limit enforced on write).
- **Keywords** — Comma- or line-separated tokens merged with preset **Keywords** (film stock markers, deduplication, and total size limits apply).

When multiple files are selected, the UI can show **Multiple** where values differ. Pending changes can target **all selected files** when you write.

### Optional local AI (Ollama)

With **exactly one file** staged, the Notes header offers an **AI** control that calls a **local Ollama** server over HTTP (`/api/chat`) with a downscaled JPEG preview of the image. It appends a short description to **Notes** (respecting remaining space under the EXIF limit) and merges suggested **Keywords** with the field. Only **loopback** hosts are allowed (e.g. `127.0.0.1`). Configure the base URL and model with **`EXIFMOD_OLLAMA_HOST`** and **`EXIFMOD_OLLAMA_MODEL`** if needed. ExifMod does not install or start Ollama.

### Clipboard and menus

Use the **Edit** menu (or standard shortcuts such as **⌘C** / **Ctrl+C**, **⌘A** / **Ctrl+A**) to copy or select text in Notes, Keywords, and the EXIF preview. On macOS, an Edit menu with standard roles is required for those shortcuts to apply to the web content.

---

## Import and export presets

From the **File** menu:

- **Import Preset Database…** — Merge presets from a previously exported ExifMod SQLite database. Conflicts or invalid rows are reported; valid presets are imported.
- **Export Preset Database…** — Save the current preset database as `presets.sqlite3` to a folder you choose (useful for backup or moving to another machine).

---

## Startup checks (preflight)

On launch, the app verifies that the preset database is usable and that **ExifTool** can be found and executed. If something is wrong, the user sees a clear message (missing DB, no presets, ExifTool not on PATH, etc.).

---

## Localization

The interface language follows the **operating system** locale when a matching translation exists; otherwise it falls back to **English**. Strings are maintained as JSON files under `locales/` in the repository.

---

## Relationship to technical documentation

- `**[exif-preset-mapping.md](exif-preset-mapping.md)`** — Exact merge order, tag-level behavior, Film/Keywords, Author/Copyright formatting, and code references. Use it for implementation or deep EXIF questions.

---

## Maintenance

**Update this document** when user-visible behavior, workflows, or features change (new menus, new categories, different supported formats, import/export rules, etc.), so it stays accurate for users and contributors.