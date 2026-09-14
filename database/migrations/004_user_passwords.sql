-- ── PUSECGIS: User Passwords (004) ───────────────────────────────────
-- Add password_hash to users table and seed initial admin user.

-- 1. Add password_hash column
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);

-- 2. Seed the admin user (password: change-me-in-production)
INSERT INTO users (username, display_name, role, password_hash, active)
VALUES (
    'admin.bjs',
    'Administrator - BJC',
    'admin',
    '$2b$12$HzmdXiroQ1m3Sz71AnSOJOoWM0EnA6QugEL0Gzpcqtaq2wai3Mg0m',
    true
)
ON CONFLICT (username) DO UPDATE
    SET password_hash = EXCLUDED.password_hash,
        display_name = EXCLUDED.display_name,
        role = EXCLUDED.role,
        active = EXCLUDED.active;
