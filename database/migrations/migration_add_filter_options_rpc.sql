-- Migration: Add RPC to fetch available filter options efficiently
-- This replaces the heavy client-side aggregation in Inventory Page

CREATE OR REPLACE FUNCTION get_inventory_filter_options(
    p_warehouse_id UUID DEFAULT NULL,
    p_location_code TEXT DEFAULT NULL,
    p_box_code TEXT DEFAULT NULL,
    p_brand TEXT DEFAULT NULL,
    p_target_audience TEXT DEFAULT NULL,
    p_product_group TEXT DEFAULT NULL,
    p_season TEXT DEFAULT NULL,
    p_launch_month TEXT DEFAULT NULL
)
RETURNS TABLE (
    brands TEXT[],
    targets TEXT[],
    product_groups TEXT[],
    seasons TEXT[],
    months TEXT[],
    locations TEXT[],
    boxes TEXT[]
)
AS $$
DECLARE
    v_brands TEXT[];
    v_targets TEXT[];
    v_groups TEXT[];
    v_seasons TEXT[];
    v_months TEXT[];
    v_locations TEXT[];
    v_boxes TEXT[];
BEGIN
    -- Common CTE to filter items
    -- We filter by ALL parameters to replicate current "Narrowing" behavior (Cascading Options)
    WITH filtered_products AS (
        SELECT DISTINCT 
            p.brand, 
            p.target_audience, 
            p.product_group, 
            p.season, 
            p.launch_month,
            COALESCE(l_box.code, l_direct.code) as location_code,
            b.code as box_code
        FROM inventory_items i
        JOIN products p ON i.product_id = p.id
        LEFT JOIN boxes b ON i.box_id = b.id
        LEFT JOIN locations l_box ON b.location_id = l_box.id
        LEFT JOIN locations l_direct ON i.location_id = l_direct.id
        WHERE 
            i.quantity > 0 AND
            (p_warehouse_id IS NULL OR i.warehouse_id = p_warehouse_id) AND
            (p_location_code IS NULL OR COALESCE(l_box.code, l_direct.code) = p_location_code) AND
            (p_box_code IS NULL OR b.code = p_box_code) AND
            (p_brand IS NULL OR p.brand = p_brand) AND
            (p_target_audience IS NULL OR p.target_audience = p_target_audience) AND
            (p_product_group IS NULL OR p.product_group = p_product_group) AND
            (p_season IS NULL OR p.season = p_season) AND
            (p_launch_month IS NULL OR p.launch_month::text = p_launch_month)
    )
    SELECT 
        ARRAY_AGG(DISTINCT brand) FILTER (WHERE brand IS NOT NULL),
        ARRAY_AGG(DISTINCT target_audience) FILTER (WHERE target_audience IS NOT NULL),
        ARRAY_AGG(DISTINCT product_group) FILTER (WHERE product_group IS NOT NULL),
        ARRAY_AGG(DISTINCT season) FILTER (WHERE season IS NOT NULL),
        ARRAY_AGG(DISTINCT launch_month::text) FILTER (WHERE launch_month IS NOT NULL),
        ARRAY_AGG(DISTINCT location_code) FILTER (WHERE location_code IS NOT NULL),
        ARRAY_AGG(DISTINCT box_code) FILTER (WHERE box_code IS NOT NULL)
    INTO v_brands, v_targets, v_groups, v_seasons, v_months, v_locations, v_boxes
    FROM filtered_products;

    -- Return as single row of arrays
    brands := COALESCE(v_brands, ARRAY[]::TEXT[]);
    targets := COALESCE(v_targets, ARRAY[]::TEXT[]);
    product_groups := COALESCE(v_groups, ARRAY[]::TEXT[]);
    seasons := COALESCE(v_seasons, ARRAY[]::TEXT[]);
    months := COALESCE(v_months, ARRAY[]::TEXT[]);
    locations := COALESCE(v_locations, ARRAY[]::TEXT[]);
    boxes := COALESCE(v_boxes, ARRAY[]::TEXT[]);
    
    RETURN NEXT;
END;
$$ LANGUAGE plpgsql;
