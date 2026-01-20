
-- Create a real-time view for Product Availability
-- MAINTAINABILITY NOTES:
-- 1. Warehouses: This view automatically sums Quantity across ALL warehouses. No change needed when adding warehouses.
-- 2. Transaction Types: To add new demand sources (e.g. Production Orders), add a 'UNION ALL' block to the 'soft_allocation' CTE.
-- 3. Statuses: Ensure the WHERE clauses match your latest workflow (curr: 'APPROVED').

CREATE OR REPLACE VIEW view_product_availability AS
WITH soft_allocation AS (
    -- 1. Sales Orders
    SELECT 
        oi.product_id, 
        SUM(oi.quantity) as qty,
        'ORDER' as type
    FROM order_items oi
    JOIN orders o ON oi.order_id = o.id
    WHERE o.status = 'APPROVED'
    GROUP BY oi.product_id

    UNION ALL

    -- 2. Transfer Orders (Item)
    SELECT 
        ti.product_id, 
        SUM(ti.quantity) as qty,
        'TRANSFER' as type
    FROM transfer_order_items ti
    JOIN transfer_orders tr ON ti.transfer_id = tr.id
    WHERE tr.status = 'approved' AND tr.transfer_type != 'BOX'
    GROUP BY ti.product_id

    UNION ALL
    
    -- 3. Transfer Orders (Box)
    SELECT 
        inv.product_id, 
        SUM(inv.quantity) as qty,
        'TRANSFER' as type
    FROM transfer_order_items ti
    JOIN transfer_orders tr ON ti.transfer_id = tr.id
    JOIN inventory_items inv ON ti.box_id = inv.box_id
    WHERE tr.status = 'approved' AND tr.transfer_type = 'BOX'
    GROUP BY inv.product_id
),
aggregated_soft AS (
    SELECT 
        product_id, 
        SUM(CASE WHEN type = 'ORDER' THEN qty ELSE 0 END) as soft_orders,
        SUM(CASE WHEN type = 'TRANSFER' THEN qty ELSE 0 END) as soft_transfers
    FROM soft_allocation
    GROUP BY product_id
)
SELECT 
    p.id as product_id,
    p.sku,
    p.name,
    COALESCE(SUM(i.quantity), 0) as total_quantity,
    COALESCE(SUM(i.allocated_quantity), 0) as hard_allocated,
    
    COALESCE(s.soft_orders, 0) as soft_booked_orders,
    COALESCE(s.soft_transfers, 0) as soft_booked_transfers,
    
    -- Real Available = Total - Hard - Soft(Orders) - Soft(Transfers)
    GREATEST(0, 
        COALESCE(SUM(i.quantity), 0) 
        - COALESCE(SUM(i.allocated_quantity), 0) 
        - COALESCE(s.soft_orders, 0) 
        - COALESCE(s.soft_transfers, 0)
    ) as available_quantity
FROM products p
LEFT JOIN inventory_items i ON p.id = i.product_id
LEFT JOIN aggregated_soft s ON p.id = s.product_id
GROUP BY p.id, p.sku, p.name, s.soft_orders, s.soft_transfers;

-- Now you can query:
-- supabase.from('view_product_availability').select('available_quantity').eq('product_id', '...')
