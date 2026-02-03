
DROP VIEW IF EXISTS view_launch_soon_bulk;

CREATE OR REPLACE VIEW view_launch_soon_bulk AS
WITH combined_inventory AS (
    -- Bulk Inventory (Always has Box & Location via Box)
    SELECT 
        bi.quantity,
        b.code as box_code,
        l.code as location_code,
        w.name as warehouse_name,
        bi.product_id,
        'BULK' as inventory_type
    FROM bulk_inventory bi
    JOIN boxes b ON bi.box_id = b.id
    JOIN locations l ON b.location_id = l.id
    JOIN warehouses w ON bi.warehouse_id = w.id
    WHERE bi.quantity > 0

    UNION ALL

    -- Piece Inventory (Can be in Box or Direct Location)
    SELECT 
        ii.quantity,
        b.code as box_code,
        COALESCE(l_via_box.code, l_direct.code) as location_code,
        w.name as warehouse_name,
        ii.product_id,
        'PIECE' as inventory_type
    FROM inventory_items ii
    LEFT JOIN boxes b ON ii.box_id = b.id
    LEFT JOIN locations l_via_box ON b.location_id = l_via_box.id
    LEFT JOIN locations l_direct ON ii.location_id = l_direct.id
    JOIN warehouses w ON ii.warehouse_id = w.id
    WHERE ii.quantity > 0
)
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
    ci.quantity,
    ci.box_code,
    ci.location_code,
    ci.warehouse_name,
    ci.inventory_type
FROM restricted_inventory ri
JOIN products p ON ri.sku = p.sku
JOIN combined_inventory ci ON p.id = ci.product_id
WHERE ri.is_launching_soon = TRUE;
