# Publishing EXIFmod for Homebrew (cask bump)

Release **binaries** (DMG, ZIP, auto-update metadata) are built and published from the **[exifmod](https://github.com/prettyoaktree/exifmod)** app repository (GitHub Actions on version tags). The **homebrew-exifmod** tap hosts the **cask definition** only; the cask downloads the DMG from **exifmod** releases.

## One command (recommended)

From the **EXIFmod app** repository, with a local clone of the tap at `TAP_DIR`:

```bash
TAP_DIR=/path/to/homebrew-exifmod ./scripts/publish-homebrew-tap-release.sh
```

**No `VERSION=`** — the script reads `**version` from `package.json**`.

The script:

1. Optionally runs `**npm run build**` in the app repo when `release/EXIFmod-<version>.dmg` is missing (unless `**SKIP_BUILD=1**`; use `**FORCE_BUILD=1**` to rebuild anyway).
2. If the DMG is still missing, it prefers the small `**EXIFmod-<version>.dmg.sha256**` asset published next to the DMG on the app release (uploaded by CI after each build). If that file is missing (older releases), it **downloads** the full DMG and hashes it locally.
3. Uses that **sha256** for the cask (no redundant DMG download when the checksum asset exists).
4. Updates `**Casks/exifmod.rb`** in your tap clone (version + sha256 URL already points at the app repo release).
5. Opens a **PR** to `**main`** on `**prettyoaktree/homebrew-exifmod`**.

### Optional env


| Variable              | Meaning                                                                                                  |
| --------------------- | -------------------------------------------------------------------------------------------------------- |
| `SKIP_BUILD=1`        | Never run `npm run build`; require an existing local DMG or a published GitHub release to download from. |
| `FORCE_BUILD=1`       | Always run `npm run build` even if `release/EXIFmod-<version>.dmg` exists.                               |
| `SKIP_HOUSEKEEPING=1` | Do **not** delete older GitHub Releases on the **tap** repo after success.                               |
| `DMG_PATH`            | Override path to the DMG (default `<app-repo>/release/EXIFmod-<version>.dmg`).                           |
| `APP_REPO`            | Override app org/repo (default `prettyoaktree/exifmod`).                                        |
| `TAP_REPO`            | Override tap org/repo (default `prettyoaktree/homebrew-exifmod`).                                        |


Requires `**gh`** authenticated (`gh auth login`) with permission to open PRs on the tap repo.

## Housekeeping on the tap repo

By default the script **deletes other releases** on `**prettyoaktree/homebrew-exifmod`** so only the current tap-related release tag remains. This does **not** affect `**exifmod`** app releases (those must be retained for auto-updates). Use `**SKIP_HOUSEKEEPING=1**` to keep historical tap releases.

## App releases (source of truth)

Tag `**v<version>`** on `**main**` in **exifmod** after bumping `**package.json`** so CI publishes matching artifacts. See `**maintainer.md`** in the app repo for signing secrets and operator checklists.

## Homebrew + in-app updater policy

- Homebrew cask is primarily a **bootstrap/install** channel for EXIFmod.
- EXIFmod also supports in-app auto-updates on signed macOS builds, so the app version installed on disk can move ahead of what Homebrew originally installed.
- Cask uses `auto_updates true` intentionally:
  - normal `brew upgrade --cask` should avoid aggressively reinstalling this cask,
  - users who explicitly want Homebrew to force upgrade auto-updating casks can use greedy flags.
- Release ops requirement: when a new EXIFmod GitHub release is published, update/publish the Homebrew cask bump in the same release cycle so fresh Homebrew installs bootstrap to the latest version.
- GitHub app-release retention: keep a rolling window of the newest **3** releases for updater safety; prune older releases only after validating the newest release feed/assets.

