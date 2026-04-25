---
name: exifmod-release
description: >-
  Ships a new EXIFmod (exifmod) version end-to-end: semver bump in
  package.json, git tag vX.Y.Z, GitHub Release with macOS + Windows artifacts and
  updater metadata, release notes, Homebrew cask bump, and winget-pkgs manifest
  bump (staged under winget/manifests/). Use when the user asks to release,
  ship, tag, bump version, publish GitHub release, or cut a patch/minor/major
  for EXIFmod. For user-guide release-notes edits, follow
  .cursor/skills/exifmod-user-docs/SKILL.md.
---

# EXIFmod release (exifmod)

## Preconditions

- Changes are on `main` per repo policy (protected branch: use a PR when required).
- `npm test` passes on the commit you will tag.
- Maintainer signing secrets are configured for **Release (macOS)** (and optional Windows code signing) — see [maintainer.md](maintainer.md), [.github/workflows/release-macos.yml](.github/workflows/release-macos.yml), and [.github/workflows/release-windows.yml](.github/workflows/release-windows.yml).

## Critical invariant (do not skip)

**`package.json` `version` must match the git tag before anything is called “released”.**

- Tag format: `v` + semver from `package.json`, e.g. `version` `1.3.3` → tag `v1.3.3`.
- The macOS workflow runs `npm run release:github`, which reads **`require('./package.json').version`** for artifact names and `gh release upload` (see workflow “Upload DMG SHA256” step). A tag **without** a matching `package.json` bump produces **wrong filenames**, **wrong updater version**, and **empty or mismatched** release assets.

**Anti-pattern:** creating only a GitHub “release” + tag with **no workflow run** or **no assets** — in-app auto-update (`electron-updater`) will not work.

**Anti-pattern:** running `gh release create vX.Y.Z` **before** CI finishes **unless** you know what you are doing: `electron-builder` defaults to **`publish.releaseType: draft`**. A **published** release created first makes uploads **skip** with `existingType=release publishingType=draft` — you end up with **no DMG/ZIP/installer** (only side effects such as `gh release upload` for the SHA256 step). This repo sets **`releaseType: "release"`** in [package.json](package.json) `build.publish` so CI can upload to a normal release. Prefer **push the tag first**, let CI attach assets, **then** edit release notes in the GitHub UI (or use `gh release edit`).

## Ordered checklist

Copy and tick through:

1. [ ] **Choose semver** (patch / minor / major).
2. [ ] **Bump** `version` in [package.json](package.json) on `main` and commit (e.g. `chore(release): bump version to X.Y.Z`).
3. [ ] **Push** `main` (or merge PR then pull latest locally).
4. [ ] **Tag** that exact commit: `git tag -a vX.Y.Z -m "Release vX.Y.Z"` then `git push origin vX.Y.Z`.
5. [ ] **Wait for CI**: both [`.github/workflows/release-macos.yml`](.github/workflows/release-macos.yml) and [`.github/workflows/release-windows.yml`](.github/workflows/release-windows.yml) run on `push: tags: v*`. Confirm **both** succeed.
6. [ ] **Verify GitHub Release assets** (required for updater + Homebrew / winget scripts):
   - **macOS:** `EXIFmod-<version>.dmg`, `EXIFmod-<version>.dmg.sha256`, `EXIFmod-<version>.zip`, `latest-mac.yml`
   - **Windows:** `EXIFmod-<version>-setup.exe` (NSIS), `EXIFmod-<version>-setup.exe.sha256` (from Windows CI), `latest.yml`, and related blockmap files from electron-builder
   - Under `releases/download/v<version>/` (not an untagged draft URL) — see [maintainer.md](maintainer.md) § Release checklist.
7. [ ] **Release notes**: create or edit the GitHub release for `vX.Y.Z` with highlights and commit range since the previous tag (repo convention in [AGENTS.md](AGENTS.md)).
7b. [ ] **User guide — release notes** (optional but recommended for user-visible work): if `vX.Y.Z` has **headline** changes end users would notice, follow [`.cursor/skills/exifmod-user-docs/SKILL.md`](../exifmod-user-docs/SKILL.md) when updating [docs/user/release-notes.md](../../../docs/user/release-notes.md): keep entries sorted newest -> oldest, run `npm run site:build`, and commit matching [website/docs/](../../../website/docs/) output so the [docs site](https://prettyoaktree.github.io/exifmod/docs/release-notes.html) stays in sync.
8. [ ] **Publish the GitHub release** (not a draft): after assets and notes are in place, confirm `isDraft` is false and clear draft if needed:
   - `gh release view vX.Y.Z --json isDraft,isLatest`
   - If `isDraft` is true: `gh release edit vX.Y.Z --draft=false`
   - To mark this release as the **latest** on the repo: `gh release edit vX.Y.Z --latest` (use when this version should supersede prior releases in the GitHub UI).
9. [ ] **Homebrew cask** (same release cycle): from a clean tap clone, run  
   `TAP_DIR=/path/to/homebrew-exifmod ./scripts/publish-homebrew-tap-release.sh` — see [maintainer.md](maintainer.md).
10. [ ] **Winget community manifest** (Windows catalog): with `gh` authenticated and a **shallow clone of your winget-pkgs fork** (add **`upstream`** → `https://github.com/microsoft/winget-pkgs.git` once), run from this repo (same pattern as **`TAP_DIR`** for Homebrew — you must set the path):
   - `WINGET_PKGS_DIR=/path/to/your/winget-pkgs-fork-clone ./scripts/publish-winget-release.sh`  
   - The script copies [`winget/manifests/p/PrettyOakTree/EXIFmod/<version>/`](../../../winget/manifests/p/PrettyOakTree/EXIFmod/), fills **`InstallerSha256`** from **`EXIFmod-<version>-setup.exe.sha256`** on the GitHub Release (uploaded by Windows CI), commits on a branch from **`upstream/master`**, pushes to **`origin`**, and opens a PR to **`microsoft/winget-pkgs`**. Use **`DRY_RUN=1`** to preview commands.
   - **Optional (Windows):** `winget validate --manifest <path>` / local install test before merging upstream.
11. [ ] **Retention**: maintainer policy — keep a rolling window of the latest **3** app releases on GitHub before pruning older ones.

## Commands reference

```bash
# After version bump commit is on main
git tag -a vX.Y.Z -m "Release vX.Y.Z"
git push origin vX.Y.Z

# Verify release has assets (must not be empty)
gh release view vX.Y.Z --json tagName,assets

# Ensure release is published (not draft) and optionally latest
gh release view vX.Y.Z --json isDraft,isLatest
gh release edit vX.Y.Z --draft=false
gh release edit vX.Y.Z --latest

# Local publish (maintainers / CI parity); requires GH_TOKEN and signing env
npm run release:github

# Winget-pkgs PR (after release assets include EXIFmod-<ver>-setup.exe.sha256)
WINGET_PKGS_DIR=/path/to/your/winget-pkgs-fork-clone ./scripts/publish-winget-release.sh
```

## Agent behavior

- **Do not** mark a release complete until step **6** passes (non-empty assets, correct tag) and step **8** passes (release is not a draft unless intentionally shipping a draft).
- **Do not** declare “released” from tag + empty GitHub release alone.
- If the user only asked for a tag, **still** ensure `package.json` was bumped on the tagged commit; otherwise stop and explain the invariant.
- After shipping, if `package.json` on `main` still lags the tag, treat that as a **process bug** to fix with a follow-up bump commit (do not assume tag alone updates the repo version).

## Optional: personal Cursor skill

To use this workflow in other clones, symlink or copy `.cursor/skills/exifmod-release/` into the user skills path documented in Cursor’s “create skill” guidance (never use `~/.cursor/skills-cursor/`, which is reserved).
