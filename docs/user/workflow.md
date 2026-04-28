# Core workflow

1. Open a folder — you’ll see a list of supported image files.
2. Select one or more files in the list.
3. Review and edit metadata in the right-hand pane (use presets for camera, lens, film, author, and the other fields as needed). Your pending changes will be indicated in the file list as icons. To clear pending edits for a subset of files only (without the confirmation used by **Clear Pending Changes** for the whole folder), right-click a row and choose **Clear Pending Changes** from the menu, or focus the list and press **C**: with several files selected, every selected file is reset; otherwise the sole selected or focused file is reset.
4. Preview EXIF changes (optional) — if you’re the type of person who finds comfort in a well-formed tag list, this feature is for you. You're welcome.
5. Write pending changes — that applies your edits to the selected files.

## Film Roll Log Workflow (XLSX and Logbook JSON)

You can use EXIFmod to create and import a shot log as an **Excel** workbook (`.xlsx`) or import a **Logbook** export as **JSON** (array of frame objects).

### Excel (`.xlsx`)

1. Create a film roll log from EXIFmod.
2. Choose a log name, camera preset, optional lens preset, film stock preset, optional author preset, and frame count.
3. EXIFmod saves an `.xlsx` file to your chosen location.
4. Fill out shutter/aperture/description/keywords values in your spreadsheet app.
5. Back in EXIFmod, open the folder that contains the scanned images for that roll.
6. Import the `.xlsx` log and match any unknown preset names if prompted.
7. Review pending changes, then write when you're ready.

You can add more rows to the spreadsheet later if your roll has more exposures.

### Logbook JSON (`.json`)

1. Export or save your roll as a JSON **array** (one object per frame) from Logbook or a compatible tool.
2. In EXIFmod, open the folder whose file list order should match the roll (the same order as in the file list).
3. Choose **Import Film Roll Log…** and pick the `.json` file.
4. Resolve any unknown preset names if prompted, then review pending changes and write when you're ready.

**Field mapping (Logbook → EXIFmod):**

- **DocumentName** → film stock preset for the whole roll (must be the same on every frame, after trimming; otherwise import fails).
- **Notes** → per-image description (pending text). Logbook’s **Description** field is not used.
- **Make** / **Model** → camera preset name (combined). **LensMake** / **LensModel** → optional lens preset.
- **ExposureTime** (seconds) and **FNumber** → shutter speed and aperture strings.
- **SourceFile** is used only to **match** each JSON row to a file in the open folder: the file’s base name **without extension** is compared to the last segment of `SourceFile` (also without extension), so `001.tif` in the log can align with `001.jpg` in the folder.
- Rows that do not match any file name are assigned to remaining images in **`ImageNumber`** ascending order. If nothing matches by name, every row is placed in that order against the folder list from top to bottom.
- The imported log’s display name comes from the **JSON file name**, not from fields such as `ReelName`.

**Requirements:**

- The JSON array length must equal the number of images in the current folder.
- Two folder images must not share the same base name (ignoring extension), or matching is ambiguous.

### Common notes

- Import requires that the number of log rows (Excel or JSON) matches the number of images in the currently open folder.

## File Formats

EXIFmod works with JPEG, TIFF, and common RAW files.

- RAW: metadata goes into an XMP sidecar file next to each original file (so your original is left alone in the usual RAW sense).
- JPEG and TIFF: metadata is written directly into the file. EXIFmod will prompt you to create a backup, if you'd like.

