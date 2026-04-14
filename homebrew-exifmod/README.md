# homebrew-exifmod

A [Homebrew tap](https://docs.brew.sh/Taps) that distributes **EXIFmod** for macOS. The cask downloads the **signed release DMG** from the public **[exifmod-electron](https://github.com/prettyoaktree/exifmod-electron)** app repository’s [GitHub Releases](https://github.com/prettyoaktree/exifmod-electron/releases). This tap repository holds the **cask definition** and release automation for bumping it.

## Install

```bash
brew tap prettyoaktree/homebrew-exifmod
brew install --cask exifmod
```

Upgrade after the tap is updated:

```bash
brew update && brew upgrade --cask exifmod
```

## Hard dependency: ExifTool

EXIFmod **requires [ExifTool](https://exiftool.org/)** (`exiftool` on your `PATH`) to read and write image metadata; it is **not** bundled in the app.

This cask declares `depends_on formula: "exiftool"`, so Homebrew should install **exiftool** when you install the cask. If you remove ExifTool or install EXIFmod without Homebrew, ensure `exiftool` is available (e.g. `which exiftool`).

## Repository layout

- `Casks/exifmod.rb` — cask definition (version, checksum, download URL to **exifmod-electron** releases).

## Maintainer notes

- **Sync from app repo:** Canonical tap files are maintained in the EXIFmod app repo under `homebrew-exifmod/`. Copy or merge that directory into this repository when publishing.
- **Publishing a version:** See [`RELEASE.md`](./RELEASE.md).
- **Branch protection:** Configure `main` per [`BRANCH_PROTECTION.md`](./BRANCH_PROTECTION.md) (PRs only, code owner approval, `CODEOWNERS`).
