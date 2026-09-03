-- ── PUSECGIS: Initial Database Schema (001) ──────────────────────────
-- PostgreSQL 16 + PostGIS 3.4
-- Target: Public Safety Common Operating Picture (BJC Healthcare)
-- ──────────────────────────────────────────────────────────────────────

BEGIN;

-- ── Extensions ──────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── 1. users ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
    id          BIGSERIAL PRIMARY KEY,
    username    VARCHAR(80)  NOT NULL UNIQUE,
    display_name VARCHAR(120) NOT NULL,
    role        VARCHAR(20)  NOT NULL DEFAULT 'officer'
                    CHECK (role IN ('officer', 'dispatch', 'lead', 'admin')),
    active      BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_role      ON users (role);
CREATE INDEX idx_users_active    ON users (active);

COMMENT ON TABLE  users IS 'Hospital Public Safety personnel';
COMMENT ON COLUMN users.role   IS 'officer | dispatch | lead | admin';

-- ── 2. shifts ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS shifts (
    id          BIGSERIAL PRIMARY KEY,
    shift_date  DATE         NOT NULL,
    shift_code  VARCHAR(10)  NOT NULL DEFAULT 'DAY'
                    CHECK (shift_code IN ('DAY', 'EVE', 'NIGHT')),
    start_time  TIME         NOT NULL,
    end_time    TIME         NOT NULL,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_shifts_date        ON shifts (shift_date);
CREATE INDEX idx_shifts_code        ON shifts (shift_code);

COMMENT ON TABLE  shifts  IS 'Hospital shift definitions';
COMMENT ON COLUMN shifts.shift_code IS 'DAY | EVE | NIGHT';

-- ── 3. locations ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS locations (
    id          BIGSERIAL PRIMARY KEY,
    name        VARCHAR(200) NOT NULL,
    building    VARCHAR(100),
    floor       VARCHAR(50),
    room_or_area VARCHAR(100),
    latitude    NUMERIC(10, 7),
    longitude   NUMERIC(10, 7),
    geom        GEOGRAPHY(POINT, 4326),
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_locations_building  ON locations (building);
CREATE INDEX idx_locations_floor     ON locations (floor);
CREATE INDEX idx_locations_geom      ON locations USING GIST (geom);

COMMENT ON TABLE   locations  IS 'Physical locations on BJC campus';
COMMENT ON COLUMN  locations.geom IS 'Spatial location (SRID 4326)';

-- ── 4. incidents ────────────────────────────────────────────────────
CREATE TYPE incident_status AS ENUM ('open', 'resolved', 'monitoring');

CREATE TABLE IF NOT EXISTS incidents (
    id               BIGSERIAL PRIMARY KEY,
    shift_id         BIGINT         NOT NULL REFERENCES shifts (id) ON DELETE CASCADE,
    incident_type    VARCHAR(40)    NOT NULL
                    CHECK (incident_type IN (
                        'victim_of_violence',
                        'problematic_patient',
                        'agitated_visitor',
                        'patient_with_sitter',
                        'elopment_patient',
                        'hardware_facility_issue',
                        'general_safety_concern',
                        'duress_alarm_call'
                    )),
    location_ref     VARCHAR(300)   NOT NULL,
    geom             GEOGRAPHY(POINT, 4326),
    description      TEXT,
    status           incident_status NOT NULL DEFAULT 'open',
    logged_by        BIGINT         NOT NULL REFERENCES users (id),
    created_at       TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_incidents_shift       ON incidents (shift_id);
CREATE INDEX idx_incidents_type        ON incidents (incident_type);
CREATE INDEX idx_incidents_status      ON incidents (status);
CREATE INDEX idx_incidents_geom        ON incidents USING GIST (geom);
CREATE INDEX idx_incidents_created     ON incidents (created_at DESC);

COMMENT ON TABLE    incidents   IS 'Reported safety incidents';
COMMENT ON COLUMN   incidents.incident_type IS 'Type codes matching the colour map in the spec';

-- ── 5. handoff_notes (renamed from shift_handoff) ───────────────────
CREATE TABLE IF NOT EXISTS handoff_notes (
    id          BIGSERIAL PRIMARY KEY,
    shift_id    BIGINT          NOT NULL REFERENCES shifts (id) ON DELETE CASCADE,
    location_ref VARCHAR(300)   NULL,   -- NULL = building-wide
    note        TEXT            NOT NULL,
    logged_by   BIGINT          NOT NULL REFERENCES users (id),
    created_at  TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_handoff_shift  ON handoff_notes (shift_id);
CREATE INDEX idx_handoff_created ON handoff_notes (created_at DESC);

COMMENT ON TABLE   handoff_notes IS 'Shift-to-shift handoff notes';
COMMENT ON COLUMN  handoff_notes.location_ref IS 'NULL = building-wide handoff';

-- ── Trigger: auto-update updated_at ─────────────────────────────────
CREATE OR REPLACE FUNCTION _update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION _update_updated_at();

CREATE TRIGGER trg_locations_updated_at
    BEFORE UPDATE ON locations
    FOR EACH ROW EXECUTE FUNCTION _update_updated_at();

CREATE TRIGGER trg_incidents_updated_at
    BEFORE UPDATE ON incidents
    FOR EACH ROW EXECUTE FUNCTION _update_updated_at();

COMMIT;
