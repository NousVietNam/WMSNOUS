-- =====================================================
-- Migration: Ensure Boxes RLS Policies
-- Description: Fix potential RLS issues where authenticated users
--              cannot see boxes or related items.
-- =====================================================

-- 1. Enable RLS on boxes (if not already)
ALTER TABLE boxes ENABLE ROW LEVEL SECURITY;

-- 2. Create/Replace Policy for Boxes
DROP POLICY IF EXISTS "Enable read access for all users" ON boxes;
CREATE POLICY "Enable read access for all users" ON boxes
    FOR SELECT
    USING (true); -- Allow everyone to read boxes

DROP POLICY IF EXISTS "Enable insert access for authenticated users" ON boxes;
CREATE POLICY "Enable insert access for authenticated users" ON boxes
    FOR INSERT
    WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Enable update access for authenticated users" ON boxes;
CREATE POLICY "Enable update access for authenticated users" ON boxes
    FOR UPDATE
    USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Enable delete access for authenticated users" ON boxes;
CREATE POLICY "Enable delete access for authenticated users" ON boxes
    FOR DELETE
    USING (auth.role() = 'authenticated');


-- 3. Ensure Outbound Order Items is readable
ALTER TABLE outbound_order_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Enable read access for all users" ON outbound_order_items;
CREATE POLICY "Enable read access for all users" ON outbound_order_items
    FOR SELECT
    USING (true);

-- 4. Ensure Locations is readable
ALTER TABLE locations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Enable read access for all users" ON locations;
CREATE POLICY "Enable read access for all users" ON locations
    FOR SELECT
    USING (true);
