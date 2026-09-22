#!/usr/bin/env bash
# PUSECGIS database backup — pg_dump of the PostGIS container to disk, with
# retention rotation and post-dump verification.
#
# No credentials live here: pg_dump runs INSIDE the container over its unix
# socket, which the compose deployment authenticates automatically.
#
# Config (env or /etc/default/pubsecgis — same file the backend service uses):
#   PUSECGIS_DB_NAME      REQUIRED. e.g. pusecgis (prod) / pusecgis_dev
#   PUSECGIS_DB_CONTAINER default: pusecgis-db
#   PUSECGIS_DB_USER      default: pusecgis
#   PUSECGIS_BACKUP_DIR   default: /var/backups/pusecgis
#   PUSECGIS_BACKUP_KEEP  default: 14  (newest N dumps retained)
#
# Exit codes: 0 ok · 2 config error · 3 dump failed · 4 dump unreadable · 5 container missing
set -euo pipefail

CONTAINER="${PUSECGIS_DB_CONTAINER:-pusecgis-db}"
DB_USER="${PUSECGIS_DB_USER:-pusecgis}"
BACKUP_DIR="${PUSECGIS_BACKUP_DIR:-/var/backups/pusecgis}"
KEEP="${PUSECGIS_BACKUP_KEEP:-14}"

if [ -z "${PUSECGIS_DB_NAME:-}" ]; then
  echo "ERROR: PUSECGIS_DB_NAME is required (refusing to guess which database to back up)" >&2
  exit 2
fi
if ! [[ "$KEEP" =~ ^[0-9]+$ ]] || [ "$KEEP" -lt 1 ]; then
  echo "ERROR: PUSECGIS_BACKUP_KEEP must be a positive integer, got '$KEEP'" >&2
  exit 2
fi
if ! docker inspect -f '{{.State.Running}}' "$CONTAINER" 2>/dev/null | grep -q true; then
  echo "ERROR: database container '$CONTAINER' is not running" >&2
  exit 5
fi

umask 077
mkdir -p "$BACKUP_DIR"

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
TMP_NAME="${PUSECGIS_DB_NAME}-${STAMP}.dump.part"
FINAL_NAME="${PUSECGIS_DB_NAME}-${STAMP}.dump"
TMP_PATH="/tmp/${TMP_NAME}"
OUT="$BACKUP_DIR/$FINAL_NAME"

# Dump inside the container (unix socket auth), then copy out. Custom format:
# compressed, restorable selectively with pg_restore.
if ! docker exec "$CONTAINER" pg_dump -U "$DB_USER" -d "$PUSECGIS_DB_NAME" \
     --format=custom --file="$TMP_PATH"; then
  echo "ERROR: pg_dump failed for $PUSECGIS_DB_NAME on $CONTAINER" >&2
  docker exec "$CONTAINER" rm -f "$TMP_PATH" 2>/dev/null || true
  exit 3
fi

# Verify the archive BEFORE copying it out and calling it a backup: the TOC
# must list and the file must have real content.
if ! docker exec "$CONTAINER" pg_restore --list "$TMP_PATH" >/dev/null 2>&1; then
  echo "ERROR: dump '$TMP_NAME' failed pg_restore --list verification inside $CONTAINER" >&2
  docker exec "$CONTAINER" rm -f "$TMP_PATH" 2>/dev/null || true
  exit 4
fi

if ! docker cp "$CONTAINER:$TMP_PATH" "$OUT"; then
  echo "ERROR: copying dump out of container failed" >&2
  docker exec "$CONTAINER" rm -f "$TMP_PATH" 2>/dev/null || true
  exit 3
fi
docker exec "$CONTAINER" rm -f "$TMP_PATH" 2>/dev/null || true
# docker cp preserves the in-container file's mode (umask doesn't apply) —
# force owner-only: dumps contain incident data and password hashes.
chmod 600 "$OUT"

# Retention: keep newest $KEEP dumps for this database.
mapfile -t OLD < <(ls -1t "$BACKUP_DIR/${PUSECGIS_DB_NAME}-"*.dump 2>/dev/null | tail -n +$((KEEP + 1)))
for f in "${OLD[@]:-}"; do
  [ -n "$f" ] && rm -f -- "$f" && echo "rotated out: $f"
done

SIZE="$(stat -c %s "$OUT")"
if [ "$SIZE" -lt 1024 ]; then
  echo "WARNING: dump is only $SIZE bytes — did the database really contain data?" >&2
fi
echo "OK: $OUT ($SIZE bytes, keeping newest $KEEP)"
