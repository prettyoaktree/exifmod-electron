# Publishing EXIFmod DMGs from this repository

Release artifacts are **not** built in CI on the app repo. The publish script builds, signs, and notarizes **locally** (via your normal `npm run build` env), uploads the DMG **here**, then bumps the cask.

## One command (recommended)

From the **EXIFmod app** repository, with a local clone of **this** tap at `TAP_DIR`:

```bash
TAP_DIR=/path/to/homebrew-exifmod ./scripts/publish-homebrew-tap-release.sh
```

**No `VERSION=`** — the script reads **`version` from `package.json`** and builds `release/EXIFmod-<version>.dmg` accordingly.

The script:

1. Runs **`npm run build`** in the app repo (set **`SKIP_BUILD=1`** if you already have a matching `release/EXIFmod-*.dmg`)
2. Creates or updates GitHub Release **`v<version>`** on **prettyoaktree/homebrew-exifmod**
3. Uploads the DMG as the release asset
4. Sets the cask **`version`** / **`sha256`** and opens a PR to **`main`**
5. **Deletes every other GitHub Release** on the tap repo (keeps only the release you just published). Set **`SKIP_HOUSEKEEPING=1`** to skip this step.

Requires **`gh`** authenticated (`gh auth login`) with permission to create/delete releases on the tap repo.

Optional: **`DMG_PATH`**, **`SKIP_BUILD`**, **`SKIP_HOUSEKEEPING`** — see the script header in `scripts/publish-homebrew-tap-release.sh`.

## Manual steps (alternative)

1. Bump **`version`** in the app repo’s `package.json`, then build (`npm run build`).
2. On [github.com/prettyoaktree/homebrew-exifmod/releases](https://github.com/prettyoaktree/homebrew-exifmod/releases), create release **`v<version>`** and attach **`EXIFmod-<version>.dmg`**.
3. Update `Casks/exifmod.rb` in a branch (version + sha256) and open a PR, or run the script with **`SKIP_BUILD=1`**.

## Old releases

The script **removes older releases** on the tap repo by default so only the current DMG remains. Homebrew users only care about **`Casks/exifmod.rb`** on `main`; deleting old releases is safe for installs and keeps the release list small. Use **`SKIP_HOUSEKEEPING=1`** if you want to keep historical releases.
