# ExifMod

Electron desktop app for editing EXIF metadata using a preset catalog.

## Localization

- User-facing strings live under `locales/` as JSON per language (e.g. `en.json`, `fr.json`). Keys are nested (`menu.file`, `ui.commitChanges`, …).
- The app picks the UI language from the OS (`app.getLocale()` in the main process; the renderer can read the resolved tag via `getLocale()` IPC). Unsupported languages fall back to English.
- Translators should copy `locales/en.json` to a new locale file, translate the **values** only, and add the base language code to `SUPPORTED` in `src/shared/i18n/resolveLocale.ts` so it is recognized.
- Interpolation uses `{{name}}` style placeholders—keep those tokens intact in translations.
