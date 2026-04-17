#!/usr/bin/env bash
# Copy staged winget manifests into a clone of your winget-pkgs fork, fill InstallerSha256
# from EXIFmod-<version>-setup.exe.sha256 on GitHub Releases (uploaded by Windows CI),
# commit on a branch from upstream/master, push, and open a PR to microsoft/winget-pkgs.
#
# Prerequisites: gh CLI (gh auth login). Run from the app repo root.
# If WINGET_PKGS_DIR uses sparse checkout, the script runs sparse-checkout add for manifests/p/PrettyOakTree.
#
# Usage:
#   WINGET_PKGS_DIR=/path/to/your/winget-pkgs-fork-clone ./scripts/publish-winget-release.sh
#
# Required env:
#   WINGET_PKGS_DIR  — git clone of your fork of github.com/microsoft/winget-pkgs (same idea as TAP_DIR for Homebrew)
#
# Optional env:
#   APP_REPO         — default: prettyoaktree/exifmod-electron
#   DRY_RUN=1        — print actions only (no git/gh changes)
#   SKIP_SHA_REFRESH=1 — copy YAML as-is (do not patch InstallerSha256; not recommended)

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VERSION="$(cd "$ROOT" && node -p "require('./package.json').version")"
WINGET_PKGS_DIR="${WINGET_PKGS_DIR:?Set WINGET_PKGS_DIR to a git clone of your fork of https://github.com/microsoft/winget-pkgs}"
APP_REPO="${APP_REPO:-prettyoaktree/exifmod-electron}"
UPSTREAM_URL="${UPSTREAM_URL:-https://github.com/microsoft/winget-pkgs.git}"
TAG="v${VERSION}"
SHA256_NAME="EXIFmod-${VERSION}-setup.exe.sha256"
SETUP_NAME="EXIFmod-${VERSION}-setup.exe"

SRC="${ROOT}/winget/manifests/p/PrettyOakTree/EXIFmod/${VERSION}"
REL_DEST="manifests/p/PrettyOakTree/EXIFmod/${VERSION}"
DEST="${WINGET_PKGS_DIR}/${REL_DEST}"
INSTALLER_FILE="${WINGET_PKGS_DIR}/${REL_DEST}/PrettyOakTree.EXIFmod.installer.yaml"
BRANCH="bump/prettyoaktree-exifmod-${VERSION}"

run() {
  if [[ "${DRY_RUN:-0}" == "1" ]]; then
    printf '[dry-run]'
    printf ' %q' "$@"
    printf '\n'
  else
    "$@"
  fi
}

echo "Using version ${VERSION} from package.json"
echo "App repo (release assets): ${APP_REPO}"
echo "Winget fork clone: ${WINGET_PKGS_DIR}"

if [[ ! -d "${SRC}" ]]; then
  echo "error: staged manifests missing: ${SRC}" >&2
  exit 1
fi

if [[ ! -d "${WINGET_PKGS_DIR}/.git" ]]; then
  echo "error: WINGET_PKGS_DIR must be a git clone (missing .git under ${WINGET_PKGS_DIR})" >&2
  exit 1
fi

if [[ -n "$(git -C "${WINGET_PKGS_DIR}" status --porcelain 2>/dev/null)" ]]; then
  echo "error: winget-pkgs clone has uncommitted changes: ${WINGET_PKGS_DIR}" >&2
  exit 1
fi

if ! command -v gh >/dev/null 2>&1; then
  echo "error: install GitHub CLI (gh): https://cli.github.com/" >&2
  exit 1
fi

if ! gh release view "${TAG}" --repo "${APP_REPO}" &>/dev/null; then
  echo "error: release ${TAG} not found on ${APP_REPO}. Publish the app release first." >&2
  exit 1
fi

if ! gh release view "${TAG}" --repo "${APP_REPO}" --json assets -q ".assets[].name" | grep -qxF "${SETUP_NAME}"; then
  echo "error: release ${TAG} on ${APP_REPO} is missing asset ${SETUP_NAME}" >&2
  exit 1
fi

if ! gh release view "${TAG}" --repo "${APP_REPO}" --json assets -q ".assets[].name" | grep -qxF "${SHA256_NAME}"; then
  echo "error: release ${TAG} on ${APP_REPO} is missing asset ${SHA256_NAME} (Windows CI should upload this)." >&2
  exit 1
fi

TMP="$(mktemp -d)"
trap 'rm -rf "${TMP}"' EXIT

SHA_UPPER=""
if [[ "${DRY_RUN:-0}" == "1" ]]; then
  echo "[dry-run] gh release download ${TAG} --repo ${APP_REPO} --pattern ${SHA256_NAME} …"
  SHA_UPPER="0000000000000000000000000000000000000000000000000000000000000000"
else
  echo "Downloading ${SHA256_NAME} from ${APP_REPO} ${TAG}…"
  gh release download "${TAG}" --repo "${APP_REPO}" --pattern "${SHA256_NAME}" --dir "${TMP}" --clobber
  SHA_FILE="${TMP}/${SHA256_NAME}"
  if [[ ! -f "${SHA_FILE}" ]]; then
    echo "error: expected ${SHA_FILE} after gh release download" >&2
    exit 1
  fi
  # Sidecar may be CRLF, UTF-8 BOM (PowerShell), or "hash  filename"; take first 64 hex chars
  SHA_HEX="$(perl -ne 'if (/([0-9a-fA-F]{64})/) { print lc($1); exit }' "${SHA_FILE}")"
  if ! [[ "${SHA_HEX}" =~ ^[0-9a-fA-F]{64}$ ]]; then
    echo "error: could not parse 64-char hex SHA256 in ${SHA256_NAME} (got ${#SHA_HEX} chars after parse): ${SHA_HEX:-<empty>}" >&2
    exit 1
  fi
  SHA_UPPER="$(printf '%s' "${SHA_HEX}" | tr '[:lower:]' '[:upper:]')"
fi

if [[ "${SKIP_SHA_REFRESH:-0}" == "1" ]]; then
  echo "SKIP_SHA_REFRESH=1 — will not patch InstallerSha256 after copy"
fi

# Fork owner for gh pr create --head <owner>:<branch>:
# - https://github.com/<owner>/<repo>.git
# - git@github.com:<owner>/<repo>.git
# - git@<ssh-host-alias>:<owner>/<repo>.git  (e.g. github.com-personal from ~/.ssh/config)
ORIGIN_URL="$(git -C "${WINGET_PKGS_DIR}" remote get-url origin)"
FORK_OWNER=""
if [[ "${ORIGIN_URL}" =~ ^https?://github.com/([^/]+)/([^/.]+)(\.git)?/?$ ]]; then
  FORK_OWNER="${BASH_REMATCH[1]}"
elif [[ "${ORIGIN_URL}" =~ ^git@[^:]+:([^/]+)/([^/.]+)(\.git)?$ ]]; then
  FORK_OWNER="${BASH_REMATCH[1]}"
else
  echo "error: could not parse fork owner from origin URL: ${ORIGIN_URL}" >&2
  exit 1
fi

if ! git -C "${WINGET_PKGS_DIR}" remote get-url upstream &>/dev/null; then
  run git -C "${WINGET_PKGS_DIR}" remote add upstream "${UPSTREAM_URL}"
fi

run git -C "${WINGET_PKGS_DIR}" fetch upstream master --depth 1

run git -C "${WINGET_PKGS_DIR}" checkout -B "${BRANCH}" upstream/master

# Sparse clones omit most of manifests/; add our subtree so git add/commit sees these files
if [[ "$(git -C "${WINGET_PKGS_DIR}" config core.sparseCheckout 2>/dev/null)" == "true" ]]; then
  run git -C "${WINGET_PKGS_DIR}" sparse-checkout add manifests/p/PrettyOakTree
fi

run mkdir -p "${DEST}"

run rsync -a "${SRC}/" "${DEST}/"

if [[ "${SKIP_SHA_REFRESH:-0}" != "1" ]]; then
  if [[ "${DRY_RUN:-0}" == "1" ]]; then
    echo "[dry-run] patch InstallerSha256 in ${INSTALLER_FILE}"
  else
    if [[ ! -f "${INSTALLER_FILE}" ]]; then
      echo "error: installer manifest not found after copy: ${INSTALLER_FILE}" >&2
      exit 1
    fi
    export SHA_U="${SHA_UPPER}"
    perl -i -pe 's{^(\s*InstallerSha256:\s*).*} {$1$ENV{SHA_U}}' "${INSTALLER_FILE}"
  fi
fi

RELEASE_URL="https://github.com/${APP_REPO}/releases/tag/${TAG}"
EXE_URL="https://github.com/${APP_REPO}/releases/download/${TAG}/${SETUP_NAME}"
PR_BODY="Update [EXIFmod](${RELEASE_URL}) **${VERSION}** (NSIS: [${SETUP_NAME}](${EXE_URL})).

- \`OliverBetz.ExifTool\` package dependency
- \`RequireExplicitUpgrade: true\` (in-app updates via electron-updater)"

if [[ "${DRY_RUN:-0}" == "1" ]]; then
  run git -C "${WINGET_PKGS_DIR}" add "${REL_DEST}"
  run git -C "${WINGET_PKGS_DIR}" commit -m "PrettyOakTree.EXIFmod ${VERSION}"
else
  git -C "${WINGET_PKGS_DIR}" add "${REL_DEST}"
  if git -C "${WINGET_PKGS_DIR}" diff --cached --quiet; then
    echo "No changes to commit (manifests already match upstream branch content?)." >&2
    exit 1
  fi
  git -C "${WINGET_PKGS_DIR}" commit -m "PrettyOakTree.EXIFmod ${VERSION}"
fi

run git -C "${WINGET_PKGS_DIR}" push -u origin "${BRANCH}"

run gh pr create --repo microsoft/winget-pkgs --base master --head "${FORK_OWNER}:${BRANCH}" \
  --title "PrettyOakTree.EXIFmod ${VERSION}" \
  --body "${PR_BODY}"

echo "Done. Review and merge the PR on microsoft/winget-pkgs."
