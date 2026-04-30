# EXIFmod Open (Lightroom Classic)

Small plug-in that adds **Library → Plug-in Extras → Open in EXIFmod**: it launches **EXIFmod** with the selected photo’s **original file path** so EXIFmod opens the containing folder and selects that file (same as the OS “Open With” experience).

## Install from EXIFmod (macOS or Windows)

In **EXIFmod**, choose **Help → Install Lightroom Classic Plugin…**. This copies `EXIFmodOpen.lrplugin` into Adobe’s **Modules** folder (overwriting any previous copy). From a **packaged** app, the EXIFmod main process **patches** `OpenInExifmod.lua` with the **.app** bundle (macOS) or **EXIFmod.exe** (Windows) path of the build you are running, so the plug-in targets the right install without relying on heuristics alone:

- **macOS:** `~/Library/Application Support/Adobe/Lightroom/Modules/`
- **Windows:** `%APPDATA%\Adobe\Lightroom\Modules\` (e.g. `C:\Users\You\AppData\Roaming\Adobe\Lightroom\Modules\`)

When you run that command from an **unpacked development build** (`npm run dev`), EXIFmod also copies **`EXIFmodOpenDev.lrplugin`** and **patches** `OpenInExifmodDev.lua` with the absolute path to the **Electron** binary and the repo root:

- **macOS:** `node_modules/electron/dist/Electron.app`
- **Windows:** `node_modules\electron\dist\electron.exe`

Both official plug-ins pass **`--exifmod-from-lrc`** so EXIFmod can treat the launch as coming from Lightroom Classic (startup tip and write-confirm behavior). They use **`LrShell.openPathsViaCommandLine`** (Lightroom SDK 3.0+).

### macOS launch

**`/usr/bin/open -n -a Electron.app --args --exifmod-from-lrc <absolute-repo-root> <file>`** (dev) or **`EXIFmod.app`** the same way without the repo (release). **`-n`** is required so a second process starts briefly and the running EXIFmod receives **`second-instance`** with argv; otherwise macOS may only activate the app and not pass the file path.

### Windows launch

**`EXIFmod.exe` — or `electron.exe` in dev** — is invoked with **`--exifmod-from-lrc`**, the repo (dev only), and the image path, so a second process triggers **`second-instance`**. There is no `/usr/bin/open` on Windows.

The dev bundle is **not** shipped inside release artifacts; it exists in the repository under `extras/lightroom-classic-exifmod-open/`.

Then in **Lightroom Classic**: **File → Plug-in Manager** — ensure **EXIFmod Open** (and **EXIFmod Open (Dev)** after a dev install) is enabled. Use **Library → Plug-in Extras → Open in EXIFmod** or **Open in EXIFmod Dev** while in the Library module with a photo selected.

## Manual install

Copy the folder `EXIFmodOpen.lrplugin` into the **Modules** path for your platform (see above). Restart Lightroom if needed, then enable the plug-in in **Plug-in Manager**.

## Requirements

- **EXIFmod** installed; the plug-in launches that app with the image file path.
- **Default paths:** **macOS** `EXIFmod.app` under `/Applications` (or set `exifmodAppPath`). **Windows** default EXE is under `%LOCALAPPDATA%\Programs\exifmod\EXIFmod.exe` (typical per-user install) or set `exifmodAppPath`.

## EXIFmod path

- **Default (macOS):** `/Applications/EXIFmod.app`
- **Default (Windows):** `%LOCALAPPDATA%\Programs\exifmod\EXIFmod.exe` (from `LOCALAPPDATA\Programs\exifmod\EXIFmod.exe` in the plug-in)

To use another location, set the plug-in preference key **`exifmodAppPath`** to the app bundle (macOS) or **`.exe`** (Windows); Plug-in Manager may expose preferences depending on Lightroom version.

## Limitations

- Uses **Library → Plug-in Extras** only (`LrLibraryMenuItems` in `Info.lua`), not **File → Plug-in Extras** (not the built-in **Photo → Edit In** list, which is driven by OS external-editor registration).
- One **target** photo; if multiple photos are selected, behavior follows Lightroom’s **target** photo.

## Troubleshooting

1. **Library module** — Select a photo in **Grid** or **Loupe** in **Library**, then **Library → Plug-in Extras → Open in EXIFmod**.
2. **Reload the plug-in** — **File → Plug-in Manager** → select **EXIFmod Open** → **Reload** (or quit Lightroom and reopen).
3. **Reinstall from EXIFmod** — **Help → Install Lightroom Classic Plugin…** in EXIFmod to overwrite the bundle.
4. **Plug-in Manager errors** — If the plug-in shows a **red error** or “Failed to load”, see Adobe’s log locations for Lightroom Classic (e.g. on macOS `~/Documents/lrClassicLogs/`; on Windows under the user’s Documents) or run Lightroom with diagnostics as Adobe documents for your version.
