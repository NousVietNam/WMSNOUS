-- Inspect the latest approved but unallocated outbound order and its items
WITH target_order AS (
    SELECT id, code, type, transfer_type
    FROM outbound_orders
    WHERE is_approved = TRUE 
      AND status NOT IN ('ALLOCATED', 'PICKING', 'PACKED', 'SHIPPED', 'COMPLETED')
    ORDER BY created_at DESC
    LIMIT 1
)
SELECT 
    o.code as order_code,
    o.type,
    o.transfer_type,
    p.sku,
    ooi.quantity as req_qty,
    ooi.from_box_id,
    b.code as box_code,
    -- Inventory in that box
    COALESCE(inv_stats.total_in_box, 0) as total_in_box,
    COALESCE(inv_stats.allocated_in_box, 0) as allocated_in_box,
    COALESCE(inv_stats.available_in_box, 0) as available_in_box,
    -- Global Inventory
    grp_stats.global_available
FROM target_order o
JOIN outbound_order_items ooi ON o.id = ooi.order_id
JOIN products p ON ooi.product_id = p.id
LEFT JOIN boxes b ON ooi.from_box_id = b.id
LEFT JOIN LATERAL (
    SELECT 
        SUM(quantity) as total_in_box,
        SUM(allocated_quantity) as allocated_in_box,
        SUM(quantity - COALESCE(allocated_quantity, 0)) as available_in_box
    FROM inventory_items ii
    WHERE ii.box_id = ooi.from_box_id AND ii.product_id = ooi.product_id
) inv_stats ON TRUE
LEFT JOIN LATERAL (
    SELECT available_quantity as global_available
    FROM view_product_availability vpa
    WHERE vpa.product_id = ooi.product_id
) grp_stats ON TRUE
WHERE p.sku = 'NB2S25-TB2-M04-OW-0M';
