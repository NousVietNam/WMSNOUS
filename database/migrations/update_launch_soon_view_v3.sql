
DROP VIEW IF EXISTS view_launch_soon_bulk;

CREATE OR REPLACE VIEW view_launch_soon_bulk AS
SELECT 
    ri.id as restricted_id,
    ri.sku,
    p.barcode,
    p.name as product_name,
    p.product_group,
    p.target_audience,
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
LEFT JOIN boxes b ON bi.box_id = b.id
LEFT JOIN locations l ON b.location_id = l.id
LEFT JOIN warehouses w ON bi.warehouse_id = w.id
WHERE ri.is_launching_soon = TRUE
AND bi.quantity > 0;
