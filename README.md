# ExifMod

Electron desktop app for editing EXIF metadata using a preset catalog.

## macOS: menu bar shows “Electron” during development

With `npm run dev`, the process is the prebuilt **Electron.app** from `node_modules`. The name next to the Apple menu is taken from that bundle’s **Info.plist** (`CFBundleName`), not from `app.setName()` or `Menu` templates. Runtime logs confirmed `app.getName()` is `ExifMod` while the menu bar still shows **Electron**.

**Packaged builds** (`npm run build`, `electron-builder`) install **`build.productName`** (`ExifMod`) into the generated `.app`, so the menu bar shows the correct name. Use a release build to verify branding.

**Optional (dev only):** advanced users can change `CFBundleName` / `CFBundleDisplayName` under `node_modules/electron/dist/Electron.app/Contents/Info.plist` (re-apply after upgrading Electron; tools like `patch-package` can persist the edit).

## Localization

- User-facing strings live under `locales/` as JSON per language (e.g. `en.json`, `fr.json`). Keys are nested (`menu.file`, `ui.commitChanges`, …).
- The app picks the UI language from the OS (`app.getLocale()` in the main process; the renderer can read the resolved tag via `getLocale()` IPC). Unsupported languages fall back to English.
- Translators should copy `locales/en.json` to a new locale file, translate the **values** only, and add the base language code to `SUPPORTED` in `src/shared/i18n/resolveLocale.ts` so it is recognized.
- Interpolation uses `{{name}}` style placeholders—keep those tokens intact in translations.
