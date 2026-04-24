# Maintainer notes

Operational checklist for **exifmod** releases: signing, GitHub Actions secrets, and Homebrew cask bumps. **Do not commit real credentials**—use GitHub **Actions secrets** and a password manager or keychain for values; this file should only list secret *names* and procedures.

## GitHub Actions secrets (`exifmod` repo)

In **Settings → Secrets and variables → Actions**, configure:

| Secret | Purpose |
| ------ | ------- |
| `CSC_LINK` | Base64-encoded **Developer ID Application** `.p12` (same format expected by `apple-actions/import-codesign-certs`). |
| `CSC_KEY_PASSWORD` | Password for the `.p12`. |
| `APPLE_API_KEY_P8_BASE64` | Base64-encoded contents of the App Store Connect **API key** `.p8` file. |
| `APPLE_API_KEY_ID` | Key ID from App Store Connect. |
| `APPLE_API_ISSUER` | Issuer ID (UUID) from App Store Connect. |

The workflow [`.github/workflows/release-macos.yml`](.github/workflows/release-macos.yml) writes the `.p8` to a temp path and exports `APPLE_API_KEY`, `APPLE_API_KEY_ID`, and `APPLE_API_ISSUER` for [`scripts/afterSign.mjs`](scripts/afterSign.mjs).

**Windows (optional):** To **code-sign** the NSIS installer (fewer SmartScreen warnings), configure `CSC_LINK` / `CSC_KEY_PASSWORD` for a **PFX** in the same way many Electron projects use `electron-builder` on Windows (see [electron-builder code signing](https://www.electron.build/code-signing)). If unset, CI still produces an **unsigned** Windows build that users can run with an extra SmartScreen step.

## Release checklist

1. Land changes on `main` via PR (protected branch).
2. Bump `version` in `package.json` to match the release you intend to ship.
3. Push git tag `v<version>` (must match `package.json`, e.g. `v1.0.2` for `1.0.2`).
4. **Invariant check before tagging:** `package.json.version` numeric part must equal the tag numeric part (standard: `version=1.3.2`, `tag=v1.3.2`).
5. **Do not** pre-create a **published** GitHub Release with `gh release create` before CI unless you understand `electron-builder`: it matches **draft** vs **published** releases. This repo sets `build.publish.releaseType` to **`release`** in `package.json` so assets upload correctly. If you already created an empty published release and CI skipped binaries, delete that release (`gh release delete vX.Y.Z`) and re-run the **Release (macOS)** and **Release (Windows)** workflows on `main` at the commit that includes the version bump (or move the tag and push).
6. Confirm **Release (macOS)** uploaded `EXIFmod-<version>.dmg`, `EXIFmod-<version>.dmg.sha256` (for the Homebrew bump script), `EXIFmod-<version>.zip`, and `latest-mac.yml`, and **Release (Windows)** uploaded the NSIS installer, `latest.yml`, and updater blockmap files, all under `releases/download/v<version>/...` (not an `untagged-...` draft URL).

## Homebrew cask bump

After the app release exists, run (from this repo, with a clean clone of the tap):

```bash
TAP_DIR=/path/to/homebrew-exifmod ./scripts/publish-homebrew-tap-release.sh
```

That updates the cask to download the DMG from **this** repo’s releases (not from the tap repo’s releases).

Policy notes:

- Homebrew is the bootstrap/install channel; in-app updater remains the primary day-to-day updater for signed macOS builds.
- Keep the cask versioned/checksummed (no dynamic latest URL strategy).
- Keep `auto_updates true` on the cask intentionally; cask bumps still happen every GitHub app release so new Homebrew installs get latest.
- On each GitHub app release, publish the Homebrew cask bump in the same release cycle.
- Retain a rolling window of the latest **3** app releases on GitHub for updater safety; prune older releases only after validating newest feed/artifacts.
