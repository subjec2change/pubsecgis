-- ── PUSECGIS: Archive Support (002) ───────────────────────────────────
-- Add archived_at column for auto-archiving resolved incidents.
-- Status is VARCHAR(20), so no ENUM alteration needed.
-- ───────────────────────────────────────────────────────────────────────

BEGIN;

-- 1. Add archived_at column (NULL = not yet archived)
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

-- 2. Index for efficient archived lookups
CREATE INDEX IF NOT EXISTS idx_incidents_archived_at ON incidents (archived_at) WHERE archived_at IS NOT NULL;

COMMIT;
