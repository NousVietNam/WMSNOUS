
-- Migration: Fix 'get_inventory_summary' to correctly calculate reserved stock for Box Transfers
-- Previous version ignored Box Transfers because they have NULL product_id in transfer_items.
-- This version adds logic to look up the contents of the box (via inventory_items) and sum those up.

CREATE OR REPLACE FUNCTION get_inventory_summary(
    p_location_code TEXT DEFAULT NULL,
    p_box_code TEXT DEFAULT NULL,
    p_brand TEXT DEFAULT NULL,
    p_target_audience TEXT DEFAULT NULL,
    p_product_group TEXT DEFAULT NULL,
    p_season TEXT DEFAULT NULL,
    p_launch_month TEXT DEFAULT NULL,
    p_search TEXT DEFAULT NULL,
    p_warehouse_id UUID DEFAULT NULL
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
    -- 1. Inventory Aggregates (Unchanged)
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
        (p_warehouse_id IS NULL OR i.warehouse_id = p_warehouse_id) AND
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

    -- 2. Approved Aggregates (Orders) (Unchanged)
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
        
    -- 3. Approved Aggregates (Transfers) - UPDATED FOR BOXES
    SELECT COALESCE(SUM(combined.calc_qty), 0)
    INTO v_total_approved_transfers
    FROM (
        -- A. Item Transfers (Direct Product)
        SELECT ti.quantity as calc_qty
        FROM transfer_order_items ti
        JOIN transfer_orders tr ON ti.transfer_id = tr.id
        JOIN products p ON ti.product_id = p.id
        WHERE 
            tr.status = 'approved' AND
            ti.box_id IS NULL AND -- Explicitly exclude box lines here to avoid duplication if mixed
            (p_brand IS NULL OR p.brand = p_brand) AND
            (p_target_audience IS NULL OR p.target_audience = p_target_audience) AND
            (p_product_group IS NULL OR p.product_group = p_product_group) AND
            (p_season IS NULL OR p.season = p_season) AND
            (p_launch_month IS NULL OR p.launch_month::text = p_launch_month) AND
            (p_search IS NULL OR (
                p.name ILIKE '%' || p_search || '%' OR
                p.sku ILIKE '%' || p_search || '%'
            ))

        UNION ALL

        -- B. Box Transfers (Indirect Product via Inventory of Box)
        -- Logic: If we transfer Box A, we assume ALL items currently inside Box A (in inventory_items) are being transferred/reserved.
        SELECT inv.quantity as calc_qty
        FROM transfer_order_items ti
        JOIN transfer_orders tr ON ti.transfer_id = tr.id
        JOIN inventory_items inv ON ti.box_id = inv.box_id -- Find contents of the box
        JOIN products p ON inv.product_id = p.id -- Filter by product properties
        WHERE 
            tr.status = 'approved' AND
            ti.box_id IS NOT NULL AND
            (p_brand IS NULL OR p.brand = p_brand) AND
            (p_target_audience IS NULL OR p.target_audience = p_target_audience) AND
            (p_product_group IS NULL OR p.product_group = p_product_group) AND
            (p_season IS NULL OR p.season = p_season) AND
            (p_launch_month IS NULL OR p.launch_month::text = p_launch_month) AND
            (p_search IS NULL OR (
                p.name ILIKE '%' || p_search || '%' OR
                p.sku ILIKE '%' || p_search || '%'
            ))
    ) combined;

    -- Return
    total_quantity := v_total_qty;
    total_allocated := v_total_allocated;
    total_approved := v_total_approved_orders + v_total_approved_transfers;
    RETURN NEXT;
END;
$$ LANGUAGE plpgsql;
