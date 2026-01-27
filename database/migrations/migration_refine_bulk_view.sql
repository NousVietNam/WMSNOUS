
-- Drop view first
DROP VIEW IF EXISTS view_product_availability_bulk;

-- Create refined view_product_availability_bulk
CREATE OR REPLACE VIEW view_product_availability_bulk AS
WITH soft_allocation AS (
    -- 1. Transfer Orders (Box) - Only for BULK boxes
    SELECT 
        bi.product_id, 
        SUM(bi.quantity) as qty,
        'TRANSFER' as type
    FROM transfer_order_items ti
    JOIN transfer_orders tr ON ti.transfer_id = tr.id
    JOIN boxes b ON ti.box_id = b.id
    JOIN bulk_inventory bi ON b.id = bi.box_id -- Assuming bulk_inventory links to box_id (needs verification)
    WHERE tr.status = 'approved' 
      AND tr.transfer_type = 'BOX'
      AND b.inventory_type = 'BULK'
    GROUP BY bi.product_id
),
aggregated_soft AS (
    SELECT 
        product_id, 
        SUM(CASE WHEN type = 'TRANSFER' THEN qty ELSE 0 END) as soft_transfers
    FROM soft_allocation
    GROUP BY product_id
)
SELECT 
    p.id as product_id,
    p.sku,
    p.name,
    p.image_url,
    p.barcode,
    COALESCE(SUM(bi.quantity), 0) as total_quantity,
    COALESCE(SUM(bi.allocated_quantity), 0) as hard_allocated,
    
    0 as soft_booked_orders, -- Placeholder: Standard orders don't soft-allocate Bulk yet
    COALESCE(s.soft_transfers, 0) as soft_booked_transfers,
    
    -- Real Available = Total - Hard - Soft
    GREATEST(0, 
        COALESCE(SUM(bi.quantity), 0) 
        - COALESCE(SUM(bi.allocated_quantity), 0) 
        - COALESCE(s.soft_transfers, 0)
    ) as available_quantity
FROM products p
JOIN bulk_inventory bi ON p.id = bi.product_id
LEFT JOIN aggregated_soft s ON p.id = s.product_id
GROUP BY p.id, p.sku, p.name, p.image_url, p.barcode, s.soft_transfers;

-- Permissions
GRANT SELECT ON view_product_availability_bulk TO authenticated, service_role;
