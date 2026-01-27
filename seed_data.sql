
-- Clean up test data if exists (optional, or just insert new)

-- 1. Ensure Location exists
INSERT INTO locations (code, type, capacity, pos_x, pos_y, width, height)
VALUES ('A-01-01', 'SHELF', 100, 2, 2, 2, 2)
ON CONFLICT (code) DO NOTHING;

-- 2. Ensure Box exists
INSERT INTO boxes (code, type, status, location_id)
SELECT 'BOX-TEST-001', 'STORAGE', 'OPEN', id FROM locations WHERE code = 'A-01-01'
ON CONFLICT (code) DO NOTHING;

-- 3. Insert Transaction (Always new)
INSERT INTO transactions (user_id, type, to_box_id, created_at)
SELECT 
    (SELECT id FROM users LIMIT 1), 
    'MOVE_BOX', 
    (SELECT id FROM boxes WHERE code = 'BOX-TEST-001'),
    NOW();
