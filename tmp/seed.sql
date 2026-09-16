-- Seed shifts
INSERT INTO shifts (shift_date, shift_code, start_time, end_time)
VALUES (CURRENT_DATE, 'DAY', '07:00:00', '19:00:00')
ON CONFLICT DO NOTHING;

-- Seed locations
INSERT INTO locations (name, building, floor, room_or_area) VALUES
('Main Building - Atrium', 'Main', '1', 'Atrium'),
('Main Building - Emergency Dept', 'Main', '2', 'ED Reception'),
('Childrens Hospital - Lobby', 'CH', '1', 'Lobby'),
('Parking Garage - Level 2', 'Parking', '2', 'Section B'),
('Research Building - Lab 3', 'Research', '3', 'Lab 3'),
('Main Building - Staff Lounge', 'Main', '3', 'Staff Lounge'),
('Main Building - Nurse Station A', 'Main', '4', 'Nurse Station A'),
('Main Building - Operating Room 2', 'Main', '5', 'OR 2')
ON CONFLICT DO NOTHING;

-- Check counts
SELECT 'shifts' as tbl, count(*) FROM shifts
UNION ALL SELECT 'locations', count(*) FROM locations
UNION ALL SELECT 'incidents', count(*) FROM incidents
UNION ALL SELECT 'users', count(*) FROM users;
