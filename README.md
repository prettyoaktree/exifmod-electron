# EXIFmod

Desktop app for editing **EXIF** metadata using a **preset catalog** (SQLite). Metadata read/write uses **ExifTool** on your machine.

## What you can do

Open a folder of images, pick presets (camera, lens, film, author), adjust description and keywords, preview what would change, then write metadata into your files. See **[docs/product.md](docs/product.md)** for the full user-facing walkthrough.

## Install (macOS)

**Homebrew (recommended):**

```bash
brew tap prettyoaktree/homebrew-exifmod
brew install --cask exifmod
```

The cask installs **`exiftool`**; EXIFmod still needs a working `exiftool` on your `PATH` for metadata I/O.

**Releases:** signed builds and release notes live on **[GitHub Releases](https://github.com/prettyoaktree/exifmod-electron/releases)**. The Homebrew cask downloads the DMG from there.

**In-app updates (macOS):** the signed app checks GitHub Releases for updates after launch (you are prompted before download). Use **Help → Check for Updates…** anytime. Development builds from source do not auto-update.

## Install (Windows)

1. Download the **NSIS installer** (`EXIFmod-<version>.exe`) from **[GitHub Releases](https://github.com/prettyoaktree/exifmod-electron/releases)** and run it.
2. Install **[ExifTool](https://exiftool.org/)** separately and ensure **`exiftool`** is on your **PATH** (EXIFmod does not bundle it). For example, using [winget](https://learn.microsoft.com/en-us/windows/package-manager/winget/) manually in a terminal: `winget install -e --id OliverBetz.ExifTool` — then restart EXIFmod if it was already open.
3. **In-app updates (Windows):** the packaged app uses the same GitHub Releases feed (`latest.yml`). Use **Help → Check for Updates…** after install. Unsigned builds may trigger Microsoft Defender SmartScreen until the app is code-signed.

## Build from source

```bash
npm install
npm run dev
```

| Command | Purpose |
| ------- | ------- |
| `npm run dev` | Development: electron-vite + Electron |
| `npm run build` | Typecheck, Vite build, electron-builder (artifacts under `release/`) |
| `npm run build:vite` | Build main/preload/renderer only (no installer) |
| `npm test` | Vitest |

### Development vs release data (presets, config)

Unpackaged runs (`npm run dev`, `electron-vite preview`, etc.) store Electron **user data** under a separate folder so they do not share the preset database or preferences with the **installed app**. On macOS that is typically **`~/Library/Application Support/EXIFmod-dev`** versus **`~/Library/Application Support/EXIFmod`** for the packaged build.

### Reset all app data (first-run QA)

To wipe **preferences, preset database, bundled seed re-import on next empty DB, tutorial flags, last folder choice,** and everything else stored under this app’s Electron **user data** directory for the build you are running, launch once with:

```bash
npm run dev -- -- --reset-app-data
```

(`--reset-app-data` must come after **`--`** so electron-vite forwards it to Electron; see above.) Or pass **`--reset-app-data`** after the executable when running a **packaged** build (resets the release **`EXIFmod`** user data folder, not **`EXIFmod-dev`**). Quit any other running EXIFmod instance first (single-instance lock). Combine with **`--simulate-first-run`** if you want the onboarding tutorial to open without persisting completion:

```bash
npm run dev -- --reset-app-data --simulate-first-run
```

### macOS: install a local build to `/Applications`

```bash
./install-mac-app
```

Runs `npm run build`, then copies `EXIFmod.app` from `release/` to `/Applications` (macOS only).

## Documentation

| Document | Contents |
| -------- | -------- |
| [docs/product.md](docs/product.md) | Product behavior and workflows |
| [docs/architecture.md](docs/architecture.md) | Technical layout, IPC, packaging, contributor notes |
| [docs/exif-preset-mapping.md](docs/exif-preset-mapping.md) | EXIF tags, merge rules, implementation pointers |
| [docs/status-footer.md](docs/status-footer.md) | Status bar: conditions, lights, messages, actions (keep in sync when extending) |
| [AGENTS.md](AGENTS.md) | Guidance for AI coding agents working in this repo |

## Localization

Strings live under `locales/` (`en.json`, `fr.json`, …). New locales: register the base language code in `src/shared/i18n/resolveLocale.ts`.

## Contributing

Match existing IPC and React patterns; keep UI copy in `locales/`. Run `npm test` when you change logic that is covered by tests.
