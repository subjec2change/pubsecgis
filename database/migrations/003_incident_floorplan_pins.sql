-- Immutable floorplan identities used by incident pins. Existing registry rows remain intact.
CREATE TABLE IF NOT EXISTS floorplan_versions (
    id BIGSERIAL PRIMARY KEY,
    floorplan_id BIGINT NOT NULL REFERENCES floorplans(id) ON DELETE CASCADE,
    version INTEGER NOT NULL,
    campus VARCHAR(120) NOT NULL, building VARCHAR(120) NOT NULL,
    building_id VARCHAR(60) NOT NULL, floor_name VARCHAR(120) NOT NULL,
    image VARCHAR(255) NOT NULL,
    south DOUBLE PRECISION NOT NULL, west DOUBLE PRECISION NOT NULL,
    north DOUBLE PRECISION NOT NULL, east DOUBLE PRECISION NOT NULL,
    rotation DOUBLE PRECISION NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (floorplan_id, version)
);
CREATE INDEX IF NOT EXISTS idx_floorplan_versions_floorplan ON floorplan_versions(floorplan_id);
ALTER TABLE floorplans ADD COLUMN IF NOT EXISTS current_version_id BIGINT;
INSERT INTO floorplan_versions (floorplan_id, version, campus, building, building_id,
    floor_name, image, south, west, north, east, rotation)
SELECT id, 1, campus, building, building_id, floor_name, image, south, west, north, east, rotation
FROM floorplans f
WHERE NOT EXISTS (SELECT 1 FROM floorplan_versions v WHERE v.floorplan_id = f.id);
UPDATE floorplans f SET current_version_id = v.id
FROM floorplan_versions v WHERE v.floorplan_id = f.id AND v.version = 1
  AND f.current_version_id IS NULL;
DO $$ BEGIN
    ALTER TABLE floorplans ADD CONSTRAINT floorplans_current_version_fk
        FOREIGN KEY (current_version_id) REFERENCES floorplan_versions(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE incidents ADD COLUMN IF NOT EXISTS floorplan_version_id BIGINT REFERENCES floorplan_versions(id) ON DELETE RESTRICT;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS floorplan_x DOUBLE PRECISION;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS floorplan_y DOUBLE PRECISION;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS room_label VARCHAR(120);
DO $$ BEGIN
    ALTER TABLE incidents ADD CONSTRAINT incidents_floorplan_xy_pair CHECK
        ((floorplan_version_id IS NULL AND floorplan_x IS NULL AND floorplan_y IS NULL)
         OR (floorplan_version_id IS NOT NULL AND floorplan_x IS NOT NULL AND floorplan_y IS NOT NULL
             AND floorplan_x >= 0 AND floorplan_x <= 1 AND floorplan_y >= 0 AND floorplan_y <= 1));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS incident_floorplan_pin_history (
    id BIGSERIAL PRIMARY KEY,
    incident_id BIGINT NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
    floorplan_version_id BIGINT REFERENCES floorplan_versions(id) ON DELETE RESTRICT,
    floorplan_x DOUBLE PRECISION, floorplan_y DOUBLE PRECISION,
    room_label VARCHAR(120), actor_id BIGINT NOT NULL REFERENCES users(id),
    reason TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_incident_pin_history_incident
    ON incident_floorplan_pin_history(incident_id, created_at DESC);
