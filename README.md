# EXIFmod

Desktop app for editing image metadata using a preset catalog. 

- Metadata read/write uses **ExifTool** on your machine.
- The optional generative AI feature uses a local **Ollama** server and a **vision**-capable model (default model tag **gemma4**). You can change the model, server address, and other options via **environment variables**—see **Optional local AI (Ollama)** in **[docs/product.md](docs/product.md)**. The status bar can show and edit the system prompt; those settings are saved for this install.

## Usage

Open a folder of images, pick presets (camera, lens, film, author), adjust description and keywords, preview what would change, then write metadata into your files. See **[docs/product.md](docs/product.md)** for the full user-facing walkthrough.

## Installation

### GitHub Releases

Download the correct installer for your platform from [GitHub Releases](https://github.com/prettyoaktree/exifmod-electron/releases) and run it.

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
- The build is still unsigned (same as the GitHub installer); **SmartScreen** may appear on first run—use **More info** → **Run anyway** as above.

### Updates

The installed app **checks GitHub Releases** for updates and **asks before downloading**; after a download you can restart to apply. Development builds from source do not auto-update.

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


| Document                                                   | Contents                                                                        |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------- |
| [docs/product.md](docs/product.md)                         | Product behavior and workflows                                                  |
| [docs/architecture.md](docs/architecture.md)               | Technical layout, IPC, packaging, contributor notes                             |
| [docs/exif-preset-mapping.md](docs/exif-preset-mapping.md) | EXIF tags, merge rules, implementation pointers                                 |
| [docs/status-footer.md](docs/status-footer.md)             | Status bar: conditions, lights, messages, actions (keep in sync when extending) |
| [AGENTS.md](AGENTS.md)                                     | Guidance for AI coding agents working in this repo                              |


## Localization

The app includes **English** and **French**. More languages can be added by contributing translation files; they are stored in the `locales/` directory in the source repository.