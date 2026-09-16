-- ── PUSECGIS: Schema Migration (001_initial_schema) ──────────────────
-- Creates all tables required by the application.
-- ──────────────────────────────────────────────────────────────────────

-- Enable PostGIS
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_topology;

-- Incident status enum
DO $$ BEGIN
    CREATE TYPE incident_status AS ENUM (
        'open',
        'resolved',
        'monitoring',
        'archived',
        'escalating'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- ── Users ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
    id          BIGSERIAL PRIMARY KEY,
    username    VARCHAR(80)  NOT NULL UNIQUE,
    display_name VARCHAR(120) NOT NULL,
    role        VARCHAR(20)  NOT NULL DEFAULT 'officer',
    password_hash VARCHAR(255),
    active      BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

-- ── Shifts ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS shifts (
    id          BIGSERIAL PRIMARY KEY,
    shift_date  DATE         NOT NULL,
    shift_code  VARCHAR(10)  NOT NULL DEFAULT 'DAY',
    start_time  TIME         NOT NULL,
    end_time    TIME         NOT NULL,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shifts_date ON shifts(shift_date);

-- ── Locations ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS locations (
    id           BIGSERIAL PRIMARY KEY,
    name         VARCHAR(200) NOT NULL,
    building     VARCHAR(100),
    floor        VARCHAR(50),
    room_or_area VARCHAR(100),
    latitude     NUMERIC(10, 7),
    longitude    NUMERIC(10, 7),
    geom         GEOGRAPHY(POINT, 4326),
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── Incidents ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS incidents (
    id              BIGSERIAL PRIMARY KEY,
    shift_id        BIGINT     NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
    incident_type   VARCHAR(40) NOT NULL,
    location_ref    VARCHAR(300) NOT NULL,
    geom            GEOGRAPHY(POINT, 4326),
    description     TEXT,
    status          incident_status NOT NULL DEFAULT 'open',
    response_phase  VARCHAR(32),
    logged_by       BIGINT     NOT NULL REFERENCES users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    archived_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents(status);
CREATE INDEX IF NOT EXISTS idx_incidents_logged_by ON incidents(logged_by);
CREATE INDEX IF NOT EXISTS idx_incidents_created_at ON incidents(created_at);
CREATE INDEX IF NOT EXISTS idx_incidents_geom ON incidents USING GIST (geom);

-- ── Handoff Notes ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS handoff_notes (
    id          BIGSERIAL PRIMARY KEY,
    shift_id    BIGINT     NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
    location_ref VARCHAR(300),
    note        TEXT       NOT NULL,
    logged_by   BIGINT     NOT NULL REFERENCES users(id),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_handoff_notes_shift ON handoff_notes(shift_id);
CREATE INDEX IF NOT EXISTS idx_handoff_notes_logged_by ON handoff_notes(logged_by);
