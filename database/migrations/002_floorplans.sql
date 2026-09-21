-- ── PUSECGIS: Floor Plan Registry (002_floorplans) ─────────────────────
-- Server-side registry of floor-plan sheets so new campuses can be added
-- by importing rows (no code/data-file changes). One row per sheet.
-- ────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS floorplans (
    id          BIGSERIAL PRIMARY KEY,
    floor_id    VARCHAR(60)  NOT NULL UNIQUE,     -- stable key used by the map overlay (e.g. 'pv-l8')
    campus      VARCHAR(120) NOT NULL,            -- 'North Campus'
    building    VARCHAR(120) NOT NULL,            -- 'Parkview Tower'
    building_id VARCHAR(60)  NOT NULL,            -- 'parkview-tower'
    floor_name  VARCHAR(120) NOT NULL,            -- 'Level 8'
    image       VARCHAR(255) NOT NULL,            -- '/floorplans/parkview-l8.png'
    south       DOUBLE PRECISION NOT NULL,
    west        DOUBLE PRECISION NOT NULL,
    north       DOUBLE PRECISION NOT NULL,
    east        DOUBLE PRECISION NOT NULL,        -- axis-aligned overlay rect (deg)
    rotation    DOUBLE PRECISION NOT NULL DEFAULT 0,  -- clockwise tilt (deg)
    active      BOOLEAN      NOT NULL DEFAULT TRUE,
    notes       TEXT,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_floorplans_building ON floorplans (building_id);
CREATE INDEX IF NOT EXISTS idx_floorplans_active   ON floorplans (active);

-- Free-text search over campus/building/floor for the picker
CREATE INDEX IF NOT EXISTS idx_floorplans_search
    ON floorplans
    USING gin (to_tsvector('simple', campus || ' ' || building || ' ' || floor_name));

COMMENT ON TABLE floorplans IS 'Floor-plan sheet registry: one row per overlay image served from /floorplans/';
