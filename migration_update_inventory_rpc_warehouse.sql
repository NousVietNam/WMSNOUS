-- Migration: Update 'get_inventory_summary' RPC to include warehouse_id filter
CREATE OR REPLACE FUNCTION get_inventory_summary(
    p_location_code TEXT DEFAULT NULL,
    p_box_code TEXT DEFAULT NULL,
    p_brand TEXT DEFAULT NULL,
    p_target_audience TEXT DEFAULT NULL,
    p_product_group TEXT DEFAULT NULL,
    p_season TEXT DEFAULT NULL,
    p_launch_month TEXT DEFAULT NULL,
    p_search TEXT DEFAULT NULL,
    p_warehouse_id UUID DEFAULT NULL -- New Parameter
)
RETURNS TABLE (
    total_quantity BIGINT,
    total_allocated BIGINT,
    total_approved BIGINT
)
AS $$
DECLARE
    v_total_qty BIGINT;
    v_total_allocated BIGINT;
    v_total_approved_orders BIGINT;
    v_total_approved_transfers BIGINT;
BEGIN
    -- 1. Inventory Aggregates (Filtered by Warehouse)
    SELECT 
        COALESCE(SUM(i.quantity), 0),
        COALESCE(SUM(i.allocated_quantity), 0)
    INTO v_total_qty, v_total_allocated
    FROM inventory_items i
    JOIN products p ON i.product_id = p.id
    LEFT JOIN boxes b ON i.box_id = b.id
    LEFT JOIN locations l_box ON b.location_id = l_box.id
    LEFT JOIN locations l_direct ON i.location_id = l_direct.id
    WHERE 
        (p_warehouse_id IS NULL OR i.warehouse_id = p_warehouse_id) AND -- Apply Warehouse Filter
        (p_brand IS NULL OR p.brand = p_brand) AND
        (p_target_audience IS NULL OR p.target_audience = p_target_audience) AND
        (p_product_group IS NULL OR p.product_group = p_product_group) AND
        (p_season IS NULL OR p.season = p_season) AND
        (p_launch_month IS NULL OR p.launch_month::text = p_launch_month) AND
        (p_location_code IS NULL OR COALESCE(l_box.code, l_direct.code) = p_location_code) AND
        (p_box_code IS NULL OR b.code = p_box_code) AND
        (p_search IS NULL OR (
            p.name ILIKE '%' || p_search || '%' OR
            p.sku ILIKE '%' || p_search || '%' OR
            (p.barcode IS NOT NULL AND p.barcode ILIKE '%' || p_search || '%')
        ));

    -- 2. Approved Aggregates (Orders) - Demand is conceptually global or difficult to attribute until allocated. 
    -- For now, we DO NOT filter demand by warehouse to show full picture, OR we strictly assume demand matches product.
    -- If user selects "Retail Warehouse", seeing Global Demand is acceptable behavior for now.
    SELECT COALESCE(SUM(oi.quantity), 0)
    INTO v_total_approved_orders
    FROM order_items oi
    JOIN orders o ON oi.order_id = o.id
    JOIN products p ON oi.product_id = p.id
    WHERE 
        o.is_approved = true AND 
        o.status NOT IN ('SHIPPED', 'COMPLETED') AND
        (p_brand IS NULL OR p.brand = p_brand) AND
        (p_target_audience IS NULL OR p.target_audience = p_target_audience) AND
        (p_product_group IS NULL OR p.product_group = p_product_group) AND
        (p_season IS NULL OR p.season = p_season) AND
        (p_launch_month IS NULL OR p.launch_month::text = p_launch_month) AND
        (p_search IS NULL OR (
            p.name ILIKE '%' || p_search || '%' OR
            p.sku ILIKE '%' || p_search || '%' OR 
            (p.barcode IS NOT NULL AND p.barcode ILIKE '%' || p_search || '%')
        ));
        
    -- 3. Approved Aggregates (Transfers)
    SELECT COALESCE(SUM(ti.quantity), 0)
    INTO v_total_approved_transfers
    FROM transfer_order_items ti
    JOIN transfer_orders tr ON ti.transfer_id = tr.id
    JOIN products p ON ti.product_id = p.id
    WHERE 
        tr.status = 'approved' AND
        (p_brand IS NULL OR p.brand = p_brand) AND
        (p_target_audience IS NULL OR p.target_audience = p_target_audience) AND
        (p_product_group IS NULL OR p.product_group = p_product_group) AND
        (p_season IS NULL OR p.season = p_season) AND
        (p_launch_month IS NULL OR p.launch_month::text = p_launch_month) AND
        (p_search IS NULL OR (
            p.name ILIKE '%' || p_search || '%' OR
            p.sku ILIKE '%' || p_search || '%' OR
            (p.barcode IS NOT NULL AND p.barcode ILIKE '%' || p_search || '%')
        ));

    -- Return
    total_quantity := v_total_qty;
    total_allocated := v_total_allocated;
    total_approved := v_total_approved_orders + v_total_approved_transfers;
    RETURN NEXT;
END;
$$ LANGUAGE plpgsql;
