
-- 1. View for RETAIL (Hàng Lẻ)
CREATE OR REPLACE VIEW view_product_avalibility_retail AS
WITH soft_retail AS (
    SELECT 
        ooi.product_id,
        SUM(ooi.quantity) as soft_qty
    FROM outbound_order_items ooi
    JOIN outbound_orders oo ON ooi.order_id = oo.id
    WHERE oo.is_approved = TRUE 
      AND (oo.inventory_type = 'PIECE' OR oo.inventory_type IS NULL) -- Default to Retail
      AND oo.status IN ('PENDING') -- Not yet hard allocated
    GROUP BY ooi.product_id
)
SELECT 
    p.id as product_id,
    p.sku,
    p.name,
    COALESCE(SUM(ii.quantity), 0) as total_quantity,
    COALESCE(SUM(ii.allocated_quantity), 0) as hard_allocated, -- Reserved by Waves/Job (if any)
    COALESCE(sr.soft_qty, 0) as soft_booked,
    
    GREATEST(0, 
        COALESCE(SUM(ii.quantity), 0) 
        - COALESCE(SUM(ii.allocated_quantity), 0) 
        - COALESCE(sr.soft_qty, 0)
    ) as available_quantity
FROM products p
LEFT JOIN inventory_items ii ON p.id = ii.product_id
LEFT JOIN soft_retail sr ON p.id = sr.product_id
GROUP BY p.id, p.sku, p.name, sr.soft_qty;

-- 2. View for BULK (Hàng Sỉ)
CREATE OR REPLACE VIEW view_product_avalibility_bulk AS
WITH soft_bulk AS (
    SELECT 
        ooi.product_id,
        SUM(ooi.quantity) as soft_qty
    FROM outbound_order_items ooi
    JOIN outbound_orders oo ON ooi.order_id = oo.id
    WHERE oo.is_approved = TRUE 
      AND oo.inventory_type = 'BULK'
      AND oo.status IN ('PENDING') -- Not yet hard allocated
    GROUP BY ooi.product_id
)
SELECT 
    p.id as product_id,
    p.sku,
    p.name,
    COALESCE(SUM(bi.quantity), 0) as total_quantity,
    COALESCE(SUM(bi.allocated_quantity), 0) as hard_allocated, -- Reserved by Waves
    COALESCE(sb.soft_qty, 0) as soft_booked,
    
    GREATEST(0, 
        COALESCE(SUM(bi.quantity), 0) 
        - COALESCE(SUM(bi.allocated_quantity), 0) 
        - COALESCE(sb.soft_qty, 0)
    ) as available_quantity
FROM products p
LEFT JOIN bulk_inventory bi ON p.id = bi.product_id
LEFT JOIN soft_bulk sb ON p.id = sb.product_id
GROUP BY p.id, p.sku, p.name, sb.soft_qty;
