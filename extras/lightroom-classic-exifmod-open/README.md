# EXIFmod Open (Lightroom Classic)

Small plug-in that adds **Library → Plug-in Extras → Open in EXIFmod**: it launches **EXIFmod** with the selected photo’s **original file path** so EXIFmod opens the containing folder and selects that file (same as macOS “Open With”).

## Install from EXIFmod (macOS)

In **EXIFmod**, choose **Help → Install Lightroom Classic Plugin…**. This copies `EXIFmodOpen.lrplugin` into Adobe’s **Modules** folder (overwriting any previous copy).

When you run that command from an **unpacked development build** (`npm run dev`), EXIFmod also copies **`EXIFmodOpenDev.lrplugin`** and **patches** `OpenInExifmodDev.lua` with the absolute path to **`node_modules/electron/dist/Electron.app`**. The plug-in uses **`LrShell.openPathsViaCommandLine`** to run **`/usr/bin/open -n -a Electron.app --args <absolute-repo-root> <file>`** (Lightroom SDK 3.0+). **`-n`** is required so a second process starts briefly and the running EXIFmod receives **`second-instance`** with argv; otherwise macOS may only activate the app and not pass the file path. **`openFilesInApp`** is intended for a normal app bundle path (e.g. `TextEdit.app`), not ad-hoc shell wrappers. That dev bundle is **not** shipped inside release DMGs; it exists only in the repository under `extras/lightroom-classic-exifmod-open/`.

Then in **Lightroom Classic**: **File → Plug-in Manager** — ensure **EXIFmod Open** (and **EXIFmod Open (Dev)** after a dev install) is enabled. Use **Library → Plug-in Extras → Open in EXIFmod** or **Open in EXIFmod Dev** while in the Library module with a photo selected.

## Manual install

Copy the folder `EXIFmodOpen.lrplugin` into:

`~/Library/Application Support/Adobe/Lightroom/Modules/`

Restart Lightroom if needed, then enable the plug-in in **Plug-in Manager**.

## Requirements

- **macOS** (paths assume `EXIFmod.app` under `/Applications`).
- **EXIFmod** installed; the plug-in launches that app with the image file path.

## EXIFmod path

Default: `/Applications/EXIFmod.app`. To use another location, set the plug-in preference key `exifmodAppPath` (advanced; Plug-in Manager may expose preferences depending on Lightroom version).

## Limitations

- Uses **Library → Plug-in Extras** only (`LrLibraryMenuItems` in `Info.lua`), not **File → Plug-in Extras** (not the built-in **Photo → Edit In** list, which is driven by OS external-editor registration).
- One **target** photo; if multiple photos are selected, behavior follows Lightroom’s **target** photo.

## Troubleshooting

1. **Library module** — Select a photo in **Grid** or **Loupe** in **Library**, then **Library → Plug-in Extras → Open in EXIFmod**.
2. **Reload the plug-in** — **File → Plug-in Manager** → select **EXIFmod Open** → **Reload** (or quit Lightroom and reopen).
3. **Reinstall from EXIFmod** — **Help → Install Lightroom Classic Plugin…** in EXIFmod to overwrite the bundle.
4. **Plug-in Manager errors** — If the plug-in shows a **red error** or “Failed to load”, check **~/Documents/lrClassicLogs/** (or run Lightroom from Terminal with `-traceback`).
