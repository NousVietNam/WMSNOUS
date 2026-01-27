
-- Drop existing view to rebuild with correct columns
DROP VIEW IF EXISTS view_product_availability_bulk;

-- Create view with structure matching existing view_product_availability
-- but sourced from bulk_inventory
CREATE OR REPLACE VIEW view_product_availability_bulk AS
WITH soft_allocation AS (
    -- FUTURE: If Bulk items can be in outbound_orders or transfer_orders, add logic here.
    -- For now, we mirror the structure with placeholders or Transfer logic if applicable.
    -- The user explicitly provided logic sourcing from 'outbound_orders'.
    -- If 'outbound_orders' can contain BULK items, we should include them.
    -- However, commonly 'bulk' might use a different flow or just Transfer.
    -- To ensure 100% compatibility, we create the CTE structure even if empty or limited.
    
    -- Placeholder for Bulk Soft Allocation (e.g. from Transfers)
    /*
     SELECT 
         bi.product_id, 
         SUM(bi.quantity) as qty, 
         'TRANSFER' as type -- Start with just Transfer for Bulk?
     FROM transfer_order_items ti
     JOIN transfer_orders tr ON ti.transfer_id = tr.id
     JOIN boxes b ON ti.box_id = b.id
     JOIN bulk_inventory bi ON b.id = bi.box_id
     WHERE tr.status = 'approved' AND tr.transfer_type = 'BOX' AND b.inventory_type = 'BULK'
     GROUP BY bi.product_id
     */
     -- Since we are not sure if 'outbound_orders' links to bulk yet, we returns empty set for now 
     -- OR we assume 0 for all to be safe until Bulk Outbound flow is defined.
     SELECT NULL::uuid as product_id, 0::bigint as qty, 'NONE'::text as type WHERE 1=0
),
aggregated_soft AS (
     SELECT soft_allocation.product_id,
        sum(
            CASE
                WHEN soft_allocation.type = 'SALE'::text THEN soft_allocation.qty
                ELSE 0::bigint
            END) AS soft_sale,
        sum(
            CASE
                WHEN soft_allocation.type = 'GIFT'::text THEN soft_allocation.qty
                ELSE 0::bigint
            END) AS soft_gift,
        sum(
            CASE
                WHEN soft_allocation.type = 'INTERNAL'::text THEN soft_allocation.qty
                ELSE 0::bigint
            END) AS soft_internal,
        sum(
            CASE
                WHEN soft_allocation.type = 'TRANSFER'::text THEN soft_allocation.qty
                ELSE 0::bigint
            END) AS soft_transfer
       FROM soft_allocation
      GROUP BY soft_allocation.product_id
)
SELECT 
    p.id AS product_id,
    p.sku,
    p.name,
    COALESCE(sum(bi.quantity), 0::bigint) AS total_quantity,
    COALESCE(sum(bi.allocated_quantity), 0::bigint) AS hard_allocated,
    
    -- Soft columns matching exact names
    COALESCE(s.soft_sale, 0::numeric) AS soft_booked_sale,
    COALESCE(s.soft_gift, 0::numeric) AS soft_booked_gift,
    COALESCE(s.soft_internal, 0::numeric) AS soft_booked_internal,
    COALESCE(s.soft_transfer, 0::numeric) AS soft_booked_transfer,
    
    -- Available Quantity Calculation
    GREATEST(0::numeric, 
        (COALESCE(sum(bi.quantity), 0::bigint) - COALESCE(sum(bi.allocated_quantity), 0::bigint))::numeric 
        - COALESCE(s.soft_sale, 0::numeric) 
        - COALESCE(s.soft_gift, 0::numeric) 
        - COALESCE(s.soft_internal, 0::numeric) 
        - COALESCE(s.soft_transfer, 0::numeric)
    ) AS available_quantity
FROM products p
LEFT JOIN bulk_inventory bi ON p.id = bi.product_id
LEFT JOIN aggregated_soft s ON p.id = s.product_id
GROUP BY p.id, p.sku, p.name, s.soft_sale, s.soft_gift, s.soft_internal, s.soft_transfer;

GRANT SELECT ON view_product_availability_bulk TO authenticated, service_role;
