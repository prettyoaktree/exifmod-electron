# EXIFmod

Desktop app for editing image metadata using a preset catalog.

- Requires **ExifTool** for reading and writing metadata.
- Supports local AI models for generating image descriptions and keywords — see **[docs/product.md](docs/product.md)** for setup and configuration.

## Installation

### GitHub Releases

Download the correct installer for your platform from [GitHub Releases](https://github.com/prettyoaktree/exifmod/releases) and run it.

- **macOS:** the app is signed and notarized.
- **Windows:** the app is not code-signed. The first time you run the installer or the app, **Microsoft Defender SmartScreen** may block it. Choose **More info** → **Run anyway** if you trust this release.

### macOS Installation via Homebrew

```bash
brew tap prettyoaktree/homebrew-exifmod
brew install --cask exifmod
```

- Homebrew installs **ExifTool** when needed.

### Windows Installation via Winget

```powershell
winget install -e --id PrettyOakTree.EXIFmod
```

- Winget installs **ExifTool** when needed.
- **SmartScreen** may appear on first run — choose **More info** → **Run anyway**.

### Updates

The installed app **checks GitHub Releases** for updates and **asks before downloading**; after a download you can restart to apply.

## Usage

Open a folder of images, pick presets (camera, lens, film, author), adjust description and keywords, preview what would change, then write metadata into your files. See **[docs/product.md](docs/product.md)** for the full walkthrough.

## Build From Source

```bash
npm install
npm run dev
```


| Command              | Purpose                                                              |
| -------------------- | -------------------------------------------------------------------- |
| `npm run dev`        | Development: electron-vite + Electron                                |
| `npm run build`      | Typecheck, Vite build, electron-builder (artifacts under `release/`) |
| `npm run build:vite` | Build main/preload/renderer only (no installer)                      |
| `npm test`           | Vitest                                                               |


## Documentation


| Document                           | Contents                       |
| ---------------------------------- | ------------------------------ |
| [docs/product.md](docs/product.md) | Product behavior and workflows |


### For contributors and developers


| Document                                                   | Contents                                                                    |
| ---------------------------------------------------------- | --------------------------------------------------------------------------- |
| [docs/architecture.md](docs/architecture.md)               | Technical layout, IPC, packaging, contributor notes                         |
| [docs/exif-preset-mapping.md](docs/exif-preset-mapping.md) | EXIF tags, merge rules, implementation pointers                             |
| [docs/status-footer.md](docs/status-footer.md)             | Status bar: lights, panels, copy, and actions (keep in sync when extending) |


## Localization

The app includes **English** and **French**. More languages can be added by contributing translation files to the source repository.