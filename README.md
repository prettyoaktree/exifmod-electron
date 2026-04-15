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
