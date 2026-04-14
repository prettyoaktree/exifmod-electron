#!/usr/bin/env bash
# Bump homebrew-exifmod cask after a DMG is published on this tap repo’s GitHub Releases.
# Usage: VERSION=1.2.3 ./scripts/publish-homebrew-tap-release.sh
# Optional: APP_GITHUB_REPO=owner/other-repo TAP_DIR=/path/to/homebrew-exifmod
# Default DMG URL: github.com/prettyoaktree/homebrew-exifmod/releases/download/vVERSION/
#
# Creates branch bump/exifmod-VERSION, updates Casks/exifmod.rb, pushes, opens PR (gh).
# Does not push to main (branch protection).

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VERSION="${VERSION:?Set VERSION (e.g. 1.2.3)}"
APP_GITHUB_REPO="${APP_GITHUB_REPO:-prettyoaktree/homebrew-exifmod}"
TAP_DIR="${TAP_DIR:?Set TAP_DIR to a git clone of github.com/prettyoaktree/homebrew-exifmod}"
DMG_NAME="${DMG_NAME:-EXIFmod-${VERSION}.dmg}"
DMG_URL="https://github.com/${APP_GITHUB_REPO}/releases/download/v${VERSION}/${DMG_NAME}"
CASK_REL="Casks/exifmod.rb"
CASK_FILE="${TAP_DIR}/${CASK_REL}"
BRANCH="bump/exifmod-${VERSION}"

if [[ ! -d "$TAP_DIR/.git" ]]; then
  echo "error: TAP_DIR must be a git clone (missing .git under $TAP_DIR)" >&2
  exit 1
fi

if [[ ! -f "$CASK_FILE" ]]; then
  echo "error: cask not found at $CASK_FILE (set TAP_DIR to your homebrew-exifmod clone)" >&2
  exit 1
fi

if [[ -n "$(git -C "$TAP_DIR" status --porcelain 2>/dev/null)" ]]; then
  echo "error: tap repo has uncommitted changes: $TAP_DIR" >&2
  exit 1
fi

echo "Downloading DMG for checksum: $DMG_URL"
TMP_DMG="$(mktemp -t exifmod-dmg.XXXXXX)"
trap 'rm -f "$TMP_DMG"' EXIT
curl -fL --retry 3 -o "$TMP_DMG" "$DMG_URL"
SHA256="$(shasum -a 256 "$TMP_DMG" | awk '{print $1}')"
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

if command -v gh >/dev/null 2>&1; then
  gh pr create --repo "prettyoaktree/homebrew-exifmod" --base main --head "$BRANCH" \
    --title "bump exifmod to ${VERSION}" \
    --body "Automated cask bump for [${DMG_NAME}](${DMG_URL})."
else
  echo "Install GitHub CLI (gh) or open a PR manually: branch $BRANCH"
fi
