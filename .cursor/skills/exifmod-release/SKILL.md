---
name: exifmod-release
description: >-
  Ships a new EXIFmod (exifmod-electron) version end-to-end: semver bump in
  package.json, git tag vX.Y.Z, GitHub Release with signed macOS artifacts and
  updater metadata, release notes, and Homebrew cask bump. Use when the user
  asks to release, ship, tag, bump version, publish GitHub release, or cut a
  patch/minor/major for EXIFmod.
---

# EXIFmod release (exifmod-electron)

## Preconditions

- Changes are on `main` per repo policy (protected branch: use a PR when required).
- `npm test` passes on the commit you will tag.
- Maintainer signing secrets are configured for **Release (macOS)** — see [maintainer.md](maintainer.md) and [.github/workflows/release-macos.yml](.github/workflows/release-macos.yml).

## Critical invariant (do not skip)

**`package.json` `version` must match the git tag before anything is called “released”.**

- Tag format: `v` + semver from `package.json`, e.g. `version` `1.3.3` → tag `v1.3.3`.
- The macOS workflow runs `npm run release:github`, which reads **`require('./package.json').version`** for artifact names and `gh release upload` (see workflow “Upload DMG SHA256” step). A tag **without** a matching `package.json` bump produces **wrong filenames**, **wrong updater version**, and **empty or mismatched** release assets.

**Anti-pattern:** creating only a GitHub “release” + tag with **no workflow run** or **no assets** — in-app auto-update (`electron-updater`) will not work.

## Ordered checklist

Copy and tick through:

1. [ ] **Choose semver** (patch / minor / major).
2. [ ] **Bump** `version` in [package.json](package.json) on `main` and commit (e.g. `chore(release): bump version to X.Y.Z`).
3. [ ] **Push** `main` (or merge PR then pull latest locally).
4. [ ] **Tag** that exact commit: `git tag -a vX.Y.Z -m "Release vX.Y.Z"` then `git push origin vX.Y.Z`.
5. [ ] **Wait for CI**: [`.github/workflows/release-macos.yml`](.github/workflows/release-macos.yml) runs on `push: tags: v*`. Confirm the workflow succeeds.
6. [ ] **Verify GitHub Release assets** (required for updater + Homebrew script):
   - `EXIFmod-<version>.dmg`
   - `EXIFmod-<version>.dmg.sha256`
   - `EXIFmod-<version>.zip`
   - `latest-mac.yml`
   - Under `releases/download/v<version>/` (not an untagged draft URL) — see [maintainer.md](maintainer.md) § Release checklist.
7. [ ] **Release notes**: create or edit the GitHub release for `vX.Y.Z` with highlights and commit range since the previous tag (repo convention in [AGENTS.md](AGENTS.md)).
8. [ ] **Publish the GitHub release** (not a draft): after assets and notes are in place, confirm `isDraft` is false and clear draft if needed:
   - `gh release view vX.Y.Z --json isDraft,isLatest`
   - If `isDraft` is true: `gh release edit vX.Y.Z --draft=false`
   - To mark this release as the **latest** on the repo: `gh release edit vX.Y.Z --latest` (use when this version should supersede prior releases in the GitHub UI).
9. [ ] **Homebrew cask** (same release cycle): from a clean tap clone, run  
   `TAP_DIR=/path/to/homebrew-exifmod ./scripts/publish-homebrew-tap-release.sh` — see [maintainer.md](maintainer.md).
10. [ ] **Retention**: maintainer policy — keep a rolling window of the latest **3** app releases on GitHub before pruning older ones.

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
```

## Agent behavior

- **Do not** mark a release complete until step **6** passes (non-empty assets, correct tag) and step **8** passes (release is not a draft unless intentionally shipping a draft).
- **Do not** declare “released” from tag + empty GitHub release alone.
- If the user only asked for a tag, **still** ensure `package.json` was bumped on the tagged commit; otherwise stop and explain the invariant.
- After shipping, if `package.json` on `main` still lags the tag, treat that as a **process bug** to fix with a follow-up bump commit (do not assume tag alone updates the repo version).

## Optional: personal Cursor skill

To use this workflow in other clones, symlink or copy `.cursor/skills/exifmod-release/` into the user skills path documented in Cursor’s “create skill” guidance (never use `~/.cursor/skills-cursor/`, which is reserved).
