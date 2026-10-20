#!/usr/bin/env bash
# Sync local main to the starsaboveme24/private mirror of the repo.
#
# The two remotes are owned by different GitHub accounts, and git-over-HTTPS
# authenticates with whichever account `gh` currently has active. This script
# activates the mirror account, pushes main, then restores the normal account.
#
# Usage: scripts/sync-mirror.sh   (run from anywhere in the repo)
set -euo pipefail

MIRROR_REMOTE="${MIRROR_REMOTE:-mirror}"
MIRROR_ACCOUNT="${MIRROR_ACCOUNT:-starsaboveme24}"
PRIMARY_ACCOUNT="${PRIMARY_ACCOUNT:-subjec2change}"

cd "$(git rev-parse --show-toplevel)"

if ! git remote get-url "$MIRROR_REMOTE" >/dev/null 2>&1; then
  echo "error: git remote '$MIRROR_REMOTE' is not configured." >&2
  echo "  git remote add $MIRROR_REMOTE https://github.com/$MIRROR_ACCOUNT/pubsecgis.git" >&2
  exit 1
fi

gh auth switch --user "$MIRROR_ACCOUNT" >/dev/null
trap 'gh auth switch --user "$PRIMARY_ACCOUNT" >/dev/null || true' EXIT

LOCAL_SHA="$(git rev-parse main)"
REMOTE_SHA="$(GIT_TERMINAL_PROMPT=0 git ls-remote "$MIRROR_REMOTE" refs/heads/main | cut -f1 || true)"

if [ "$LOCAL_SHA" = "$REMOTE_SHA" ]; then
  echo "mirror already up to date at $LOCAL_SHA"
  exit 0
fi

echo "syncing main -> $MIRROR_REMOTE (${REMOTE_SHA:-empty} -> $LOCAL_SHA)"
git push "$MIRROR_REMOTE" main:main
echo "mirror synced to $LOCAL_SHA"
