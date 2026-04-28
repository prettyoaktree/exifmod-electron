# Core workflow

1. Open a folder — you’ll see a list of supported image files.
2. Select one or more files in the list.
3. Review and edit metadata in the right-hand pane (use presets for camera, lens, film, author, and the other fields as needed). Your pending changes will be indicated in the file list as icons.
4. Preview EXIF changes (optional) — if you’re the type of person who finds comfort in a well-formed tag list, this feature is for you. You're welcome.
5. Write pending changes — that applies your edits to the selected files.

## Film Roll Log Workflow (XLSX)

You can use EXIFmod to create and import a shot log in `.xlsx` format:

1. Create a film roll log from EXIFmod.
2. Choose a log name, camera preset, optional lens preset, film stock preset, optional author preset, and frame count.
3. EXIFmod saves an `.xlsx` file to your chosen location.
4. Fill out shutter/aperture/description/keywords values in your spreadsheet app.
5. Back in EXIFmod, open the folder that contains the scanned images for that roll.
6. Import the `.xlsx` log and match any unknown preset names if prompted.
7. Review pending changes, then write when you're ready.

Notes:

- Only `.xlsx` logs are supported for import.
- Import requires that the number of log rows matches the number of images in the currently open folder.
- You can add more rows to the spreadsheet later if your roll has more exposures.

## File Formats

EXIFmod works with JPEG, TIFF, and common RAW files.

- RAW: metadata goes into an XMP sidecar file next to each original file (so your original is left alone in the usual RAW sense).
- JPEG and TIFF: metadata is written directly into the file. EXIFmod will prompt you to create a backup, if you'd like.

