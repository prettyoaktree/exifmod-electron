# EXIFmod

Desktop app for editing image metadata using a preset catalog.

- Requires **ExifTool** for reading and writing metadata.
- Supports local AI models for generating image descriptions and keywords — see the **[user guide (website)](https://prettyoaktree.github.io/exifmod/docs/ollama.html)** for setup.

## Public website

The public site (marketing + **user guide**) is on **GitHub Pages** at **https://prettyoaktree.github.io/exifmod/** — the guide lives at **https://prettyoaktree.github.io/exifmod/docs/**. Source: [`website/`](website/) and [`docs/user/`](docs/user/); after editing the Markdown, run `npm run site:build` so `website/docs/` is updated.

**`package.json` `homepage`** points at the [GitHub repository](https://github.com/prettyoaktree/exifmod#readme) for npm-style metadata; the `github.io` URL is the public site.

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

Open a folder of images, pick presets (camera, lens, film, author), adjust description and keywords, preview what would change, then write metadata into your files. See the **[user guide](https://prettyoaktree.github.io/exifmod/docs/)** (source: [`docs/user/`](docs/user/)) for the full walkthrough.

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


| Document / URL | Contents |
| -------------- | -------- |
| [User guide on GitHub Pages](https://prettyoaktree.github.io/exifmod/docs/) | How to install, work with files & presets, Ollama, Lightroom (readable copy of [`docs/user/`](docs/user/)) |
| [Release notes (user guide)](https://prettyoaktree.github.io/exifmod/docs/release-notes.html) | Major features and fixes by version — not every patch ([`docs/user/release-notes.md`](docs/user/release-notes.md)) |
| [docs/product.md](docs/product.md) | Pointer to the user guide and `docs/user/` for contributors |


### For contributors and developers


| Document                                                   | Contents                                                                    |
| ---------------------------------------------------------- | --------------------------------------------------------------------------- |
| [docs/architecture.md](docs/architecture.md)               | Technical layout, IPC, packaging, contributor notes                         |
| [docs/exif-preset-mapping.md](docs/exif-preset-mapping.md) | EXIF tags, merge rules, implementation pointers                             |
| [docs/status-footer.md](docs/status-footer.md)             | Status bar: lights, panels, copy, and actions (keep in sync when extending) |


## Localization

The app includes **English** and **French**. More languages can be added by contributing translation files to the source repository.