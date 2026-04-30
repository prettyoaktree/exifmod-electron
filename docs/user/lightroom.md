# Lightroom Classic

EXIFmod ships with a small Lightroom Classic plugin. You can install it from the app’s **Help** menu on **macOS** and **Windows**.

In Lightroom, select a file in the library, then use **Library → Plug-in Extras → Open in EXIFmod** to jump straight to that file in EXIFmod.

**Install location (after using Help → Install…):** on macOS, the plug-in lives under `~/Library/Application Support/Adobe/Lightroom/Modules/`. On Windows, under `%APPDATA%\Adobe\Lightroom\Modules\` (for example `C:\Users\You\AppData\Roaming\Adobe\Lightroom\Modules\`).

**Default app path (release):** the Lightroom plug-in does not know where EXIFmod is until you set it, but when you use **Help → Install Lightroom Classic Plugin…** from a **packaged** EXIFmod, the app bakes the **path to the running build** (macOS: the `EXIFmod.app` bundle; Windows: `EXIFmod.exe`) into the copied plug-in, so the usual per-user install location is detected automatically. If you copied the plug-in from the repo, skipped **Help → Install…**, or use a dev build, the old defaults still apply: `/Applications/EXIFmod.app` (macOS) and `%LOCALAPPDATA%\Programs\exifmod\EXIFmod.exe` (Windows) unless you set the plug-in preference `exifmodAppPath` in **Plug-in Manager** (path to the `.app` on macOS, or the `.exe` on Windows).

## Important: don’t lose Lightroom’s work

Lightroom leans on metadata to remember your edits. If another app rewrites the same file’s metadata, Lightroom can get confused and you can lose edits if you’re not careful.

Best approach

- Use EXIFmod before you do heavy Develop work, when you can. For example: import scans → EXIFmod for metadata → resync the folder in LrC → then your usual convert-with-NLP / edit flow.

If the photo is already developed in Lightroom

- Before you use EXIFmod, make a **Develop snapshot** for each image you care about: **Develop** module → **Develop** menu → **Snapshot** (on macOS the shortcut is **⌘N**; on Windows use the menu or your localized shortcut). When you’re done in EXIFmod, resync the folder in LrC, load metadata from files if Lightroom asks, then reapply the snapshots as needed. You might still need to nudge rotation, but your edits should come back.

This sounds fussy, but it’s a lot calmer than having Lightroom give you the silent treatment.
