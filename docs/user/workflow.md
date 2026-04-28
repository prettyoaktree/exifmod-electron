# Core workflow

1. Open a folder — you’ll see a list of supported image files.
2. Select one or more files in the list.
3. Review and edit metadata in the right-hand pane.
4. Preview EXIF changes (optional) — if you’re the type of person who finds comfort in a well-formed tag list, this feature is for you. You're welcome.
5. Write pending changes — that applies your edits to the selected files.

## Supported File Formats

EXIFmod works with JPEG, TIFF, and common RAW files.

- RAW: metadata goes into an XMP sidecar file next to each original file (so your original is left alone in the usual RAW sense).
- JPEG and TIFF: metadata is written directly into the file. EXIFmod will prompt you to create a backup, if you'd like.

## Using Film Roll Logs / Shot Logs

If you like to document your shots as you shoot, EXIFmod can import your shot log to automatically tag your photos after you develop and scan them.

- If you want to use an Excel spreadsheet for tracking your shots, click the **File** menu and choose **Create Film Roll Log…**. EXIFmod will create a spreadsheet for you. Feel free to add or remove rows, but **do not** change any of the columns (unless you want things to break).
- When importing a log to EXIFmod, make sure that the number of images in your folder is identical to the number of frames in your log. Also make absolutely sure that the order of images shown by EXIFmod exactly matches the order of frames in your log.
- During an import, if EXIFmod sees information it cannot automatically match to existing presets, it will prompt you to match them to your presets manually.
- In addition to Excel files, EXIFmod can also import JSON files exported from the [Lightme Logbook](https://lightme.site/) app. Again, make certain that the order of your shots in Lightme Logbook matches the order of your files. If you are using index numbers in your filenames, EXIFmod will attempt to match your files with the Lightme log based on the index numbers.

