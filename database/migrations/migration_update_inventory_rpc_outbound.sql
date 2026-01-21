-- =====================================================
-- Migration: Update 'get_inventory_summary' RPC for Unified Outbound System
-- Description: Replace references to legacy 'orders' and 'transfer_orders' tables
--              with the new 'outbound_orders' table
-- =====================================================

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
    v_total_approved BIGINT;
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

    -- 2. Approved Aggregates from NEW outbound_orders table
    -- Approved orders that are NOT yet shipped = reserved stock
    SELECT COALESCE(SUM(oi.quantity), 0)
    INTO v_total_approved
    FROM outbound_order_items oi
    JOIN outbound_orders o ON oi.order_id = o.id
    JOIN products p ON oi.product_id = p.id
    WHERE 
        o.is_approved = true AND 
        o.status NOT IN ('SHIPPED', 'CANCELLED') AND
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
    total_approved := v_total_approved;
    RETURN NEXT;
END;
$$ LANGUAGE plpgsql;
