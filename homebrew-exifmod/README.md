# homebrew-exifmod

A [Homebrew tap](https://docs.brew.sh/Taps) that distributes **[EXIFmod](https://github.com/prettyoaktree/exifmod-electron)** for macOS.

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

- `Casks/exifmod.rb` — cask definition (version, checksum, download URL).

Release DMGs are published on the [exifmod-electron releases](https://github.com/prettyoaktree/exifmod-electron/releases) page; this tap only points Homebrew at those assets.

## Maintainer notes

- **Sync from app repo:** The canonical tap files also live under `[exifmod-electron/homebrew-exifmod/](https://github.com/prettyoaktree/exifmod-electron/tree/main/homebrew-exifmod)` in the EXIFmod source tree. Copy or merge that directory into this repository when publishing.
- **Branch protection:** Configure `main` per `[BRANCH_PROTECTION.md](./BRANCH_PROTECTION.md)` (PRs only, code owner approval, `CODEOWNERS`).
- **Bumping the cask** after a new GitHub Release DMG exists: clone this repo, run from **exifmod-electron**  
`VERSION=x.y.z TAP_DIR=/path/to/homebrew-exifmod ./scripts/publish-homebrew-tap-release.sh`  
or edit `Casks/exifmod.rb` in a branch and open a PR.

