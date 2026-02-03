
-- 1. Add column to restricted_inventory
ALTER TABLE restricted_inventory 
ADD COLUMN IF NOT EXISTS is_launching_soon BOOLEAN DEFAULT FALSE;

ALTER TABLE restricted_inventory 
ADD COLUMN IF NOT EXISTS is_alerted BOOLEAN DEFAULT FALSE;

ALTER TABLE restricted_inventory 
ADD COLUMN IF NOT EXISTS alerted_at TIMESTAMPTZ;

-- 2. Create a view for easy access to Launch Soon items in Bulk
DROP VIEW IF EXISTS view_launch_soon_bulk;
CREATE OR REPLACE VIEW view_launch_soon_bulk AS
SELECT 
    ri.id as restricted_id,
    ri.sku,
    ri.is_launching_soon,
    ri.is_alerted,
    ri.alerted_at,
    bi.quantity,
    b.code as box_code,
    l.code as location_code,
    w.name as warehouse_name
FROM restricted_inventory ri
JOIN products p ON ri.sku = p.sku
JOIN bulk_inventory bi ON p.id = bi.product_id
JOIN boxes b ON bi.box_id = b.id
JOIN locations l ON b.location_id = l.id
JOIN warehouses w ON bi.warehouse_id = w.id
WHERE ri.is_launching_soon = TRUE;

-- 3. RPCs for alerting
CREATE OR REPLACE FUNCTION alert_launch_soon(p_skus text[]) 
RETURNS void AS $$
BEGIN
    UPDATE restricted_inventory 
    SET is_alerted = TRUE, 
        alerted_at = NOW() 
    WHERE sku = ANY(p_skus);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION reset_launch_soon_alerts() 
RETURNS void AS $$
BEGIN
    UPDATE restricted_inventory 
    SET is_alerted = FALSE 
    WHERE is_launching_soon = TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

