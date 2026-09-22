# Restore drill: proves the newest backup can actually rebuild a database.
# Restores into an EPHEMERAL throwaway database inside the same container —
# never touches the live one. Exits non-zero if row counts diverge.
#
# Usage (env): PUSECGIS_DB_NAME=<src db> [PUSECGIS_DB_CONTAINER=...] \
#              [PUSECGIS_BACKUP_DIR=...] [PUSECGIS_DB_USER=...] scripts/restore-drill.sh
set -euo pipefail

CONTAINER="${PUSECGIS_DB_CONTAINER:-pusecgis-db}"
DB_USER="${PUSECGIS_DB_USER:-pusecgis}"
BACKUP_DIR="${PUSECGIS_BACKUP_DIR:-/var/backups/pusecgis}"

if [ -z "${PUSECGIS_DB_NAME:-}" ]; then
  echo "ERROR: PUSECGIS_DB_NAME is required" >&2
  exit 2
fi

DUMP="$(ls -1t "$BACKUP_DIR/${PUSECGIS_DB_NAME}-"*.dump 2>/dev/null | head -1 || true)"
if [ -z "$DUMP" ]; then
  echo "ERROR: no dumps found for $PUSECGIS_DB_NAME in $BACKUP_DIR" >&2
  exit 2
fi
echo "drilling with: $DUMP"

DRILL_DB="zzz_restore_drill_$$"
STAGE="/tmp/zzz_restore_drill_$$.dump"

cleanup() {
  docker exec "$CONTAINER" rm -f "$STAGE" 2>/dev/null || true
  docker exec "$CONTAINER" psql -U "$DB_USER" -d postgres \
    -c "DROP DATABASE IF EXISTS $DRILL_DB WITH (FORCE);" >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker cp "$DUMP" "$CONTAINER:$STAGE"
docker exec "$CONTAINER" psql -U "$DB_USER" -d postgres -v ON_ERROR_STOP=1 \
  -c "CREATE DATABASE $DRILL_DB OWNER $DB_USER;"
docker exec "$CONTAINER" pg_restore -U "$DB_USER" -d "$DRILL_DB" --no-owner "$STAGE"

# Compare row counts of every public table between source and restored copy.
count_sql() {
  docker exec "$CONTAINER" psql -U "$DB_USER" -d "$1" -At -c "
    select tablename from pg_tables where schemaname='public' order by 1;"
}
SRC_TABLES="$(count_sql "$PUSECGIS_DB_NAME")"
DRILL_TABLES="$(count_sql "$DRILL_DB")"
if [ "$SRC_TABLES" != "$DRILL_TABLES" ]; then
  echo "FAIL: table sets differ"
  diff <(echo "$SRC_TABLES") <(echo "$DRILL_TABLES") || true
  exit 1
fi

FAIL=0
while IFS= read -r t; do
  A="$(docker exec "$CONTAINER" psql -U "$DB_USER" -d "$PUSECGIS_DB_NAME" -At -c "select count(*) from public.\"$t\";")"
  B="$(docker exec "$CONTAINER" psql -U "$DB_USER" -d "$DRILL_DB" -At -c "select count(*) from public.\"$t\";")"
  if [ "$A" != "$B" ]; then echo "MISMATCH $t: live=$A restored=$B"; FAIL=1; else echo "ok $t ($A rows)"; fi
done <<< "$SRC_TABLES"

if [ "$FAIL" -eq 0 ]; then
  echo "DRILL PASS: $DUMP restores a complete copy of $PUSECGIS_DB_NAME"
else
  echo "DRILL FAIL: row counts diverged"
  exit 1
fi
