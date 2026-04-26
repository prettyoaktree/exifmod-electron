# Release notes

Headline changes in recent versions: major features and fixes that affect how you work in EXIFmod. Patch releases often include small fixes and polish that are not listed here. For the full list of every release, see [EXIFmod on GitHub Releases](https://github.com/prettyoaktree/exifmod/releases).

## 1.8.1

**1.8.1** — File list keyboard navigation now takes over cleanly after mouse selection, while keyboard multi-select with Space still works as expected. Preset-applied rows now use the same red “pending write” treatment as other real metadata changes, and metadata table column headers are easier to scan.

## 1.8.0

**1.8.0** — Metadata pane overhaul: **Presets**, **Shutter & Aperture**, and **Description & Keywords** as subsections in one table, with shared **Current value** and **New value** columns and a single sticky column header. Pending work in the file list uses per-category icons. **New preset from metadata…** replaces the small **+** in the preset picker. After you save a new preset, other open files that already match it update without a manual refresh. The highlight for an active catalog choice is visually distinct from “pending write” rows. User guide and website screenshots refreshed.

## 1.7.x

**1.7.7** — More reliable film keyword handling for RAW files, and clearer batch write progress when you process a folder of images.

**1.7.6** — User docs and website polish pass: refreshed style guidance, cleaner chapter structure, and a new **Help → User Guide** menu link that opens the published guide directly from the app.

**1.7.5** (and steps between) — Docs and website work, including the in-repo user guide that builds this site, plus routine fixes. Check GitHub Releases for the exact build per tag.

**1.7.1–1.7.3** — Tighter Ollama describe output (shorter default prompt, less odd echoing in JSON) and clearer file list behavior: focus vs selection, a sturdier focus ring, and the metadata pane showing which files you’re editing.

**1.7.0** — Ollama: editable describe system prompt (with a reset if things go sideways), a faster and more reliable describe path, and file list / “Pending changes” copy in English and French.

## 1.6.0

- RAW files and XMP sidecar writing, with batch read/write and progress for larger folders.  
- Optional backup before writing, reopen last folder on launch, and more reliable preset/catalog matching and EXIF diff behavior.

## Earlier versions

See [Releases](https://github.com/prettyoaktree/exifmod/releases) for 1.5 and older.
