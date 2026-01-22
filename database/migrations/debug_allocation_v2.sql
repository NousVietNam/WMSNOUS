-- Find ANY active order containing the specific SKU
SELECT 
    o.code as order_code,
    o.id as order_id,
    o.status,
    o.is_approved,
    o.type,
    o.transfer_type,
    p.sku,
    ooi.quantity as req_qty,
    ooi.from_box_id,
    CASE WHEN ooi.from_box_id IS NULL THEN 'NO (Item Pick)' ELSE 'YES (Box Pick)' END as is_specific_box,
    b.code as box_code,
    -- Inventory in that box (if specific box)
    COALESCE(inv_stats.total_in_box, 0) as total_in_box,
    COALESCE(inv_stats.allocated_in_box, 0) as allocated_in_box,
    COALESCE(inv_stats.available_in_box, 0) as available_in_box,
    -- Global Inventory
    grp_stats.global_available
FROM outbound_order_items ooi
JOIN outbound_orders o ON ooi.order_id = o.id
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
WHERE p.sku = 'NB2S25-TB2-M04-OW-0M'
  AND o.status NOT IN ('COMPLETED', 'CANCELLED') -- Look for any active order
ORDER BY o.created_at DESC;
