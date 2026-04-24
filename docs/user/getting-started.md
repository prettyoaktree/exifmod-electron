# Getting started

**EXIFmod** is a desktop app for photographers and editors who want **consistent EXIF metadata** (camera, lens, film, author, exposure, notes) across images using a **saved preset catalog**, then **write those values into the files**.

## Who it’s for

- You like using **saved combinations** (bodies, lenses, film, author) instead of typing the same fields over and over.
- It works for **one photo** or a **whole folder**.

## What you need

- **ExifTool** — the installers below take care of this when you use Homebrew or winget; otherwise ExifTool has to be available for EXIFmod to read and write metadata.
- **Optional: local AI** — for auto-generated descriptions and keywords, see [Ollama and AI](ollama.html). No cloud, no API key.

## More help

- [Install and updates](install.html) — download, Homebrew, winget, updates.
- [Core workflow](workflow.html) — open a folder, edit, write.
- [Presets and metadata](presets.html) — the catalog and the metadata table.
- [Ollama and AI](ollama.html) — set up Ollama and the default model.
- [Lightroom Classic](lightroom.html) — plugin and how to stay safe with LrC.

**Developers / advanced:** tag names, merge rules, and implementation notes are in [exif-preset-mapping.md](https://github.com/prettyoaktree/exifmod/blob/main/docs/exif-preset-mapping.md) on GitHub — not a beginner doc.
