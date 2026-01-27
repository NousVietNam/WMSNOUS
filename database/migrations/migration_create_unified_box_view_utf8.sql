-- Unified view for box contents (Retail + Bulk)
CREATE OR REPLACE VIEW view_box_contents_unified AS
SELECT 
    ii.id, 
    ii.box_id, 
    ii.product_id, 
    ii.quantity, 
    'PIECE' as inventory_source,
    NULL::text as note,
    ii.created_at,
    p.sku,
    p.name as product_name,
    p.barcode
FROM inventory_items ii
JOIN products p ON ii.product_id = p.id
UNION ALL
SELECT 
    bi.id, 
    bi.box_id, 
    bi.product_id, 
    bi.quantity, 
    'BULK' as inventory_source,
    'Hàng kho sỉ (Initial)' as note,
    bi.created_at,
    p.sku,
    p.name as product_name,
    p.barcode
FROM bulk_inventory bi
JOIN products p ON bi.product_id = p.id;

-- Optimized view for boxes with joined counts
CREATE OR REPLACE VIEW view_boxes_with_counts AS
SELECT 
    b.*,
    l.code as location_code,
    COALESCE(i.total_retail, 0) + COALESCE(bu.total_bulk, 0) as total_item_count
FROM boxes b
LEFT JOIN locations l ON b.location_id = l.id
LEFT JOIN (
    SELECT box_id, SUM(quantity) as total_retail 
    FROM inventory_items 
    GROUP BY box_id
) i ON b.id = i.box_id
LEFT JOIN (
    SELECT box_id, SUM(quantity) as total_bulk 
    FROM bulk_inventory 
    GROUP BY box_id
) bu ON b.id = bu.box_id;

GRANT SELECT ON view_box_contents_unified TO anon, authenticated, service_role;
GRANT SELECT ON view_boxes_with_counts TO anon, authenticated, service_role;

