# Publishing EXIFmod DMGs from this repository

Release artifacts are **not** built in CI on the app repo. You build, sign, and notarize **locally** (or on a trusted machine), then publish the DMG **here** so Homebrew can fetch it over a public URL.

## 1. Build locally (app repository)

From the EXIFmod source tree:

```bash
npm run build
```

Configure Developer ID signing and `APPLE_API_*` for notarization as documented in the app repo README. The DMG appears under `release/`, e.g. `release/EXIFmod-1.0.0.dmg`.

## 2. Create a GitHub Release on **this** repo

1. Open [github.com/prettyoaktree/homebrew-exifmod/releases](https://github.com/prettyoaktree/homebrew-exifmod/releases).
2. **Draft a new release** with tag `vX.Y.Z` (match the `version` field in the app repo’s `package.json`).
3. Attach **`EXIFmod-X.Y.Z.dmg`** as a release asset (same filename the cask expects).
4. Publish the release.

## 3. Bump the cask (`version` + `sha256`)

After the DMG is downloadable at:

`https://github.com/prettyoaktree/homebrew-exifmod/releases/download/vX.Y.Z/EXIFmod-X.Y.Z.dmg`

update `Casks/exifmod.rb` in a branch and open a PR, or run from the app repo (with a clone of **this** tap):

```bash
VERSION=X.Y.Z TAP_DIR=/path/to/homebrew-exifmod \
  ./scripts/publish-homebrew-tap-release.sh
```

That script downloads the public DMG, recomputes `sha256`, and opens a PR against `main`.
