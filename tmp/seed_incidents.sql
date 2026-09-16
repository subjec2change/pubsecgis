-- 1. Check current state
SELECT 'shifts' as tbl, count(*) FROM shifts
UNION ALL SELECT 'locations', count(*) FROM locations
UNION ALL SELECT 'incidents', count(*) FROM incidents
UNION ALL SELECT 'users', count(*) FROM users;

-- 2. Seed incidents (20 rows with variety)
INSERT INTO incidents (shift_id, incident_type, location_ref, description, status, logged_by, created_at, updated_at, geom)
SELECT s.id,
       (ARRAY['Violence', 'Problematic Patient', 'Agitated Visitor', 'Patient with Sitter', 'Elopement Patient', 'Duress Alarm Call'])[ceil(random() * 6)],
       l.name,
       'Test incident #' || g::text,
       (ARRAY['open', 'monitoring', 'escalating', 'resolved'])[ceil(random() * 4)]::incident_status,
       u.id,
       NOW() - (random() * interval '72 hours'),
       CASE WHEN g <= 5 THEN NOW() - interval '25 hours' ELSE NOW() END,
       ST_SetSRID(ST_MakePoint(-90.1994 + (random() * 0.02 - 0.01), 38.6270 + (random() * 0.02 - 0.01)), 4326)::geography
FROM (SELECT 1) dummy,
     (SELECT id FROM shifts LIMIT 1) s,
     (SELECT id, name FROM locations ORDER BY id) l,
     (SELECT id FROM users WHERE username = 'admin.bjs' LIMIT 1) u,
     generate_series(1, 20) g;

-- 3. Verify
SELECT 'AFTER' as phase, 'shifts' as tbl, count(*) FROM shifts
UNION ALL SELECT 'AFTER', 'locations', count(*) FROM locations
UNION ALL SELECT 'AFTER', 'incidents', count(*) FROM incidents
UNION ALL SELECT 'AFTER', 'users', count(*) FROM users;

-- 4. Breakdown by type
SELECT incident_type, count(*) FROM incidents GROUP BY incident_type ORDER BY count(*) DESC;

-- 5. Breakdown by status
SELECT status, count(*) FROM incidents GROUP BY status ORDER BY count(*) DESC;
