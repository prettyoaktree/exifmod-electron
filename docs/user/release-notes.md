# Release notes

Headline changes in recent versions: major features and fixes that affect how you work in EXIFmod. Patch releases often include small fixes and polish that are not listed here. For the full list of every release, see [EXIFmod on GitHub Releases](https://github.com/prettyoaktree/exifmod/releases).

## 1.8.6

**Lightroom Classic plug-in (Windows):** you can install the same **EXIFmod Open** plug-in on Windows and open the selected photo in EXIFmod. **Help → Install Lightroom Classic Plugin** now bakes the path to your running EXIFmod (and shows success or errors in a normal in-app window instead of a system alert). See the [user guide](lightroom.html) for details.

## 1.8.5

**Film roll logs:** you can now create an Excel shot log from the app and use it to track your shots. When you're done shooting and developing, import your log back into EXIFmod to automatically tag your photos. If you're using the [Lightme Logbook](https://lightme.site/) app on your phone, you can export your shot log to JSON and then import it to EXIFmod for quick tagging.

## 1.8.1

Fixed issues with keyboard navigation and app layout.

## 1.8.0

Metadata pane overhaul: cleaner layout, clearer workflow, fancy icons to show you which updates are pending, lots of other quality-of-life improvements.

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