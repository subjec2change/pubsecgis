-- ── PUSECGIS: Seed Data (001) ────────────────────────────────────────
-- Sample users, shifts, and locations for development / demo.
-- ──────────────────────────────────────────────────────────────────────

BEGIN;

-- ── Users ────────────────────────────────────────────────────────────
INSERT INTO users (username, display_name, role, active) VALUES
    ('admin.bjs',      'BJS Administrator',        'admin',      TRUE),
    ('dispatch.hub',   'Dispatch Hub Lead',        'dispatch',   TRUE),
    ('officer.murphy', 'Officer Murphy',             'officer',    TRUE),
    ('officer.chen',   'Officer Chen',               'officer',    TRUE),
    ('lead.williams',  'Lead Williams',              'lead',       TRUE)
ON CONFLICT (username) DO NOTHING;

-- ── Shifts ───────────────────────────────────────────────────────────
INSERT INTO shifts (shift_date, shift_code, start_time, end_time) VALUES
    ('2026-09-02', 'DAY',    '06:00:00', '14:00:00'),
    ('2026-09-02', 'EVE',    '14:00:00', '22:00:00'),
    ('2026-09-02', 'NIGHT',  '22:00:00', '06:00:00'),
    ('2026-09-03', 'DAY',    '06:00:00', '14:00:00'),
    ('2026-09-03', 'EVE',    '14:00:00', '22:00:00'),
    ('2026-09-03', 'NIGHT',  '22:00:00', '06:00:00')
ON CONFLICT DO NOTHING;

-- ── Locations (Barnes-Jewish Hospital campus) ────────────────────────
-- Latitude/Longitude for Barnes-Jewish Hospital: ~38.647263, -90.257642
INSERT INTO locations (name, building, floor, room_or_area, latitude, longitude, geom) VALUES
    (
        'Main Public Safety Control',
        'Barnes-Jewish Hospital', 'Lobby', 'Public Safety Control Room',
        38.647263, -90.257642,
        ST_MakePoint(-90.257642, 38.647263)::geography
    ),
    (
        'Adult ED Desk',
        'Barnes-Jewish Hospital', '1', 'Emergency Department',
        38.647180, -90.257800,
        ST_MakePoint(-90.257800, 38.647180)::geography
    ),
    (
        'Children''s ED Desk',
        'Children''s Hospital',   '1', 'Emergency Department',
        38.648100, -90.256400,
        ST_MakePoint(-90.256400, 38.648100)::geography
    ),
    (
        'Building 3 — Main Entrance',
        'Barnes-Jewish Hospital', '1', 'Main Lobby / Entrance',
        38.647500, -90.257300,
        ST_MakePoint(-90.257300, 38.647500)::geography
    ),
    (
        'Building 3 — Floor A',
        'Barnes-Jewish Hospital', '2', 'Near Nurse Station A',
        38.647550, -90.257350,
        ST_MakePoint(-90.257350, 38.647550)::geography
    ),
    (
        'Parking Garage B — Level 1',
        'Barnes-Jewish Hospital', 'G', 'Parking Garage B, Level 1',
        38.646500, -90.258100,
        ST_MakePoint(-90.258100, 38.646500)::geography
    )
ON CONFLICT DO NOTHING;

COMMIT;
