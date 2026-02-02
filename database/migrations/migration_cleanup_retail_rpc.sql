
-- 1. FORCE CLEANUP: Drop ALL variations of get_inventory_summary
DO $$
DECLARE
    func_record RECORD;
BEGIN
    FOR func_record IN 
        SELECT oid::regprocedure as func_signature 
        FROM pg_proc 
        WHERE proname = 'get_inventory_summary'
    LOOP
        EXECUTE 'DROP FUNCTION ' || func_record.func_signature || ' CASCADE';
        RAISE NOTICE 'Dropped function: %', func_record.func_signature;
    END LOOP;
END $$;

-- 2. Recreate RETAIL Summary RPC (Clean Slate)
CREATE OR REPLACE FUNCTION get_inventory_summary(
    p_warehouse_id uuid DEFAULT NULL,
    p_location_code text DEFAULT NULL,
    p_box_code text DEFAULT NULL,
    p_brand text DEFAULT NULL,
    p_target_audience text DEFAULT NULL,
    p_product_group text DEFAULT NULL,
    p_season text DEFAULT NULL,
    p_launch_month text DEFAULT NULL,
    p_search text DEFAULT NULL
) RETURNS TABLE (
    total_quantity numeric,
    total_allocated numeric,
    total_approved_sale numeric,
    total_approved_gift numeric,
    total_approved_internal numeric,
    total_approved_transfer numeric,
    available_detail numeric,
    available_summary numeric
) AS $$
BEGIN
    RETURN QUERY
    WITH filtered_products AS (
        SELECT p.id
        FROM products p
        WHERE 
            (p_brand IS NULL OR p.brand = p_brand) AND
            (p_target_audience IS NULL OR p.target_audience = p_target_audience) AND
            (p_product_group IS NULL OR p.product_group = p_product_group) AND
            (p_season IS NULL OR p.season = p_season) AND
            (p_launch_month IS NULL OR (p.launch_month ~ '^[0-9]+$' AND p.launch_month::INT::TEXT = p_launch_month)) AND
            (
                p_search IS NULL OR 
                p.sku ILIKE '%' || p_search || '%' OR 
                p.name ILIKE '%' || p_search || '%' OR
                (p.barcode IS NOT NULL AND p.barcode ILIKE '%' || p_search || '%')
            )
    ),
    -- Inventory Stats (Supply)
    inv_stats AS (
        SELECT 
            COALESCE(SUM(ii.quantity), 0) as qty,
            COALESCE(SUM(ii.allocated_quantity), 0) as alloc
        FROM inventory_items ii
        JOIN products p ON ii.product_id = p.id
        LEFT JOIN locations l ON ii.location_id = l.id
        LEFT JOIN boxes b ON ii.box_id = b.id
        LEFT JOIN locations lb ON b.location_id = lb.id
        WHERE 
            ii.product_id IN (SELECT id FROM filtered_products) AND
            ii.quantity > 0 AND
            (p_warehouse_id IS NULL OR ii.warehouse_id = p_warehouse_id) AND
            (p_location_code IS NULL OR COALESCE(lb.code, l.code) = p_location_code) AND
            (p_box_code IS NULL OR b.code = p_box_code)
    ),
    -- Soft Stats (Demand)
    soft_stats AS (
        SELECT 
            COALESCE(SUM(CASE WHEN o.type = 'SALE' THEN ooi.quantity ELSE 0 END), 0) as s_sale,
            COALESCE(SUM(CASE WHEN o.type = 'GIFT' THEN ooi.quantity ELSE 0 END), 0) as s_gift,
            COALESCE(SUM(CASE WHEN o.type = 'INTERNAL' THEN ooi.quantity ELSE 0 END), 0) as s_internal,
            COALESCE(SUM(CASE WHEN o.type = 'TRANSFER' THEN ooi.quantity ELSE 0 END), 0) as s_transfer
        FROM outbound_order_items ooi
        JOIN outbound_orders o ON ooi.order_id = o.id
        WHERE 
            ooi.product_id IN (SELECT id FROM filtered_products) AND
            o.is_approved = TRUE AND
            (o.inventory_type = 'PIECE' OR o.inventory_type IS NULL) AND -- RETAIL Only
            o.status IN ('PENDING')
    )
    SELECT 
        (SELECT qty FROM inv_stats)::numeric,
        (SELECT alloc FROM inv_stats)::numeric,
        (SELECT s_sale FROM soft_stats)::numeric,
        (SELECT s_gift FROM soft_stats)::numeric,
        (SELECT s_internal FROM soft_stats)::numeric,
        (SELECT s_transfer FROM soft_stats)::numeric,
        
        -- available_detail = Total - Hard
        ((SELECT qty FROM inv_stats) - (SELECT alloc FROM inv_stats))::numeric,

        -- available_summary = Total - Hard - Soft
        ((SELECT qty FROM inv_stats) - (SELECT alloc FROM inv_stats) - 
         (SELECT s_sale FROM soft_stats) - (SELECT s_gift FROM soft_stats) - 
         (SELECT s_internal FROM soft_stats) - (SELECT s_transfer FROM soft_stats))::numeric
    ;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
