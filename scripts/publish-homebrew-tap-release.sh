#!/usr/bin/env bash
# Publish EXIFmod DMG to prettyoaktree/homebrew-exifmod GitHub Releases, then bump the cask (PR).
#
# Version is always taken from package.json in the app repo (no VERSION= needed).
#
# Prerequisites: gh CLI authenticated (gh auth login). Run from the app repo (script path sets app root).
#
# Usage:
#   TAP_DIR=/path/to/homebrew-exifmod ./scripts/publish-homebrew-tap-release.sh
#
# Optional env:
#   SKIP_BUILD=1        — always skip `npm run build` (DMG must already exist at DMG_PATH)
#   FORCE_BUILD=1       — always run `npm run build` even if release/EXIFmod-<version>.dmg already exists
#   SKIP_HOUSEKEEPING=1 — do not delete older GitHub Releases on the tap repo after success
#   DMG_PATH            — defaults to <app-repo>/release/EXIFmod-<version>.dmg
#   TAP_REPO            — defaults to prettyoaktree/homebrew-exifmod
#   DMG_NAME            — defaults to EXIFmod-<version>.dmg
#
# If the DMG for the current package.json version already exists, the build step is skipped (notarize runs inside npm run build).
#
# Steps: read version from package.json → npm run build (if needed) → gh release create|upload → sha256 → cask PR → delete other releases

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VERSION="$(cd "$ROOT" && node -p "require('./package.json').version")"
TAP_DIR="${TAP_DIR:?Set TAP_DIR to a git clone of github.com/prettyoaktree/homebrew-exifmod}"
TAP_REPO="${TAP_REPO:-prettyoaktree/homebrew-exifmod}"
DMG_NAME="${DMG_NAME:-EXIFmod-${VERSION}.dmg}"
DMG_PATH="${DMG_PATH:-$ROOT/release/${DMG_NAME}}"
TAG="v${VERSION}"
DMG_URL="https://github.com/${TAP_REPO}/releases/download/${TAG}/${DMG_NAME}"

CASK_REL="Casks/exifmod.rb"
CASK_FILE="${TAP_DIR}/${CASK_REL}"
BRANCH="bump/exifmod-${VERSION}"

if ! command -v gh >/dev/null 2>&1; then
  echo "error: install GitHub CLI (gh): https://cli.github.com/" >&2
  exit 1
fi

echo "Using version ${VERSION} from package.json"

if [[ "${SKIP_BUILD:-0}" == "1" ]]; then
  echo "SKIP_BUILD=1 — not running npm run build"
elif [[ "${FORCE_BUILD:-0}" == "1" ]]; then
  echo "FORCE_BUILD=1 — building DMG (npm run build in $ROOT)…"
  (cd "$ROOT" && npm run build)
elif [[ -f "$DMG_PATH" ]]; then
  echo "Found existing ${DMG_PATH} — skipping npm run build (delete the file or set FORCE_BUILD=1 to rebuild)"
else
  echo "Building DMG (npm run build in $ROOT)…"
  (cd "$ROOT" && npm run build)
fi

if [[ ! -f "$DMG_PATH" ]]; then
  echo "error: DMG not found: $DMG_PATH" >&2
  echo "  Run without SKIP_BUILD to build, or place EXIFmod-${VERSION}.dmg there, or set DMG_PATH" >&2
  exit 1
fi

if [[ "$(basename "$DMG_PATH")" != "$DMG_NAME" ]]; then
  echo "error: DMG file must be named ${DMG_NAME} (matches cask download URL); got $(basename "$DMG_PATH")" >&2
  exit 1
fi

if [[ ! -d "$TAP_DIR/.git" ]]; then
  echo "error: TAP_DIR must be a git clone (missing .git under $TAP_DIR)" >&2
  exit 1
fi

if [[ ! -f "$CASK_FILE" ]]; then
  echo "error: cask not found at $CASK_FILE" >&2
  exit 1
fi

if [[ -n "$(git -C "$TAP_DIR" status --porcelain 2>/dev/null)" ]]; then
  echo "error: tap repo has uncommitted changes: $TAP_DIR" >&2
  exit 1
fi

echo "Publishing ${DMG_NAME} to ${TAP_REPO} release ${TAG}…"
if gh release view "$TAG" --repo "$TAP_REPO" &>/dev/null; then
  echo "Release ${TAG} exists; uploading asset (replace if present)…"
  gh release upload "$TAG" "$DMG_PATH" --repo "$TAP_REPO" --clobber
else
  gh release create "$TAG" "$DMG_PATH" \
    --repo "$TAP_REPO" \
    --title "EXIFmod ${VERSION}" \
    --notes "macOS universal DMG for Homebrew cask exifmod."
fi

echo "Checksumming local DMG: $DMG_PATH"
SHA256="$(shasum -a 256 "$DMG_PATH" | awk '{print $1}')"
echo "sha256=$SHA256"

ruby - "$CASK_FILE" "$VERSION" "$SHA256" <<'RUBY'
  cask_path = ARGV[0]
  version = ARGV[1]
  sha = ARGV[2]
  body = File.read(cask_path)
  body.sub!(/^(\s*)version\s+.*$/, "\\1version \"#{version}\"")
  body.sub!(/^(\s*)sha256\s+.*$/, "\\1sha256 \"#{sha}\"")
  File.write(cask_path, body)
RUBY

git -C "$TAP_DIR" checkout -b "$BRANCH"
git -C "$TAP_DIR" add "$CASK_REL"
git -C "$TAP_DIR" commit -m "bump exifmod to ${VERSION}"
git -C "$TAP_DIR" push -u origin "$BRANCH"

gh pr create --repo "$TAP_REPO" --base main --head "$BRANCH" \
  --title "bump exifmod to ${VERSION}" \
  --body "Cask bump for [${DMG_NAME}](${DMG_URL}) (release ${TAG})."

if [[ "${SKIP_HOUSEKEEPING:-0}" == "1" ]]; then
  echo "SKIP_HOUSEKEEPING=1 — leaving other GitHub Releases as-is."
else
  echo "Housekeeping: removing other releases on ${TAP_REPO} (keeping ${TAG})…"
  while IFS= read -r rel_tag; do
    [[ -z "$rel_tag" ]] && continue
    [[ "$rel_tag" == "$TAG" ]] && continue
    echo "  Deleting release ${rel_tag} …"
    gh release delete "$rel_tag" --repo "$TAP_REPO" --yes --cleanup-tag
  done < <(gh release list --repo "$TAP_REPO" --limit 200 --json tagName -q '.[].tagName' 2>/dev/null || true)
fi

echo "Done. Approve and merge the PR per branch protection."
