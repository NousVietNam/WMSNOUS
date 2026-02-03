CREATE OR REPLACE FUNCTION get_inventory_filter_options(
    p_warehouse_id UUID DEFAULT NULL,
    p_location_code TEXT DEFAULT NULL,
    p_box_code TEXT DEFAULT NULL,
    p_brand TEXT DEFAULT NULL,
    p_target_audience TEXT DEFAULT NULL,
    p_product_group TEXT DEFAULT NULL,
    p_season TEXT DEFAULT NULL,
    p_launch_month TEXT DEFAULT NULL,
    p_inventory_type TEXT DEFAULT 'PIECE' -- 'PIECE' or 'BULK'
)
RETURNS JSON
LANGUAGE plpgsql
AS $$
DECLARE
    result JSON;
BEGIN
    IF p_inventory_type = 'BULK' THEN
        -- BULK INVENTORY LOGIC
        -- Note: bulk_inventory has box_id. Location is via boxes.locations
        SELECT json_build_array(json_build_object(
            'locations', (
                SELECT json_agg(DISTINCT l.code)
                FROM bulk_inventory bi
                JOIN products p ON bi.product_id = p.id
                JOIN boxes b ON bi.box_id = b.id
                LEFT JOIN locations l ON b.location_id = l.id
                WHERE bi.quantity > 0
                AND (p_warehouse_id IS NULL OR l.warehouse_id = p_warehouse_id) -- Bulk items in boxes might be in a warehouse
                AND (p_box_code IS NULL OR b.code = p_box_code)
                AND (p_brand IS NULL OR p.brand = p_brand)
                AND (p_target_audience IS NULL OR p.target_audience = p_target_audience)
                AND (p_product_group IS NULL OR p.product_group = p_product_group)
                AND (p_season IS NULL OR p.season = p_season)
                AND (p_launch_month IS NULL OR p.launch_month::text = p_launch_month)
                AND l.code IS NOT NULL
            ),
            'boxes', (
                SELECT json_agg(DISTINCT b.code)
                FROM bulk_inventory bi
                JOIN products p ON bi.product_id = p.id
                JOIN boxes b ON bi.box_id = b.id
                LEFT JOIN locations l ON b.location_id = l.id
                WHERE bi.quantity > 0
                AND (p_warehouse_id IS NULL OR l.warehouse_id = p_warehouse_id)
                AND (p_location_code IS NULL OR l.code = p_location_code)
                AND (p_brand IS NULL OR p.brand = p_brand)
                AND (p_target_audience IS NULL OR p.target_audience = p_target_audience)
                AND (p_product_group IS NULL OR p.product_group = p_product_group)
                AND (p_season IS NULL OR p.season = p_season)
                AND (p_launch_month IS NULL OR p.launch_month::text = p_launch_month)
            ),
            'brands', (
                SELECT json_agg(DISTINCT p.brand)
                FROM bulk_inventory bi
                JOIN products p ON bi.product_id = p.id
                JOIN boxes b ON bi.box_id = b.id
                LEFT JOIN locations l ON b.location_id = l.id
                WHERE bi.quantity > 0
                AND (p_warehouse_id IS NULL OR l.warehouse_id = p_warehouse_id)
                AND (p_location_code IS NULL OR l.code = p_location_code)
                AND (p_box_code IS NULL OR b.code = p_box_code)
                AND (p_target_audience IS NULL OR p.target_audience = p_target_audience)
                AND (p_product_group IS NULL OR p.product_group = p_product_group)
                AND (p_season IS NULL OR p.season = p_season)
                AND (p_launch_month IS NULL OR p.launch_month::text = p_launch_month)
                AND p.brand IS NOT NULL
            ),
            'targets', (
                SELECT json_agg(DISTINCT p.target_audience)
                FROM bulk_inventory bi
                JOIN products p ON bi.product_id = p.id
                JOIN boxes b ON bi.box_id = b.id
                LEFT JOIN locations l ON b.location_id = l.id
                WHERE bi.quantity > 0
                AND (p_warehouse_id IS NULL OR l.warehouse_id = p_warehouse_id)
                AND (p_location_code IS NULL OR l.code = p_location_code)
                AND (p_box_code IS NULL OR b.code = p_box_code)
                AND (p_brand IS NULL OR p.brand = p_brand)
                AND (p_product_group IS NULL OR p.product_group = p_product_group)
                AND (p_season IS NULL OR p.season = p_season)
                AND (p_launch_month IS NULL OR p.launch_month::text = p_launch_month)
                AND p.target_audience IS NOT NULL
            ),
            'product_groups', (
                SELECT json_agg(DISTINCT p.product_group)
                FROM bulk_inventory bi
                JOIN products p ON bi.product_id = p.id
                JOIN boxes b ON bi.box_id = b.id
                LEFT JOIN locations l ON b.location_id = l.id
                WHERE bi.quantity > 0
                AND (p_warehouse_id IS NULL OR l.warehouse_id = p_warehouse_id)
                AND (p_location_code IS NULL OR l.code = p_location_code)
                AND (p_box_code IS NULL OR b.code = p_box_code)
                AND (p_brand IS NULL OR p.brand = p_brand)
                AND (p_target_audience IS NULL OR p.target_audience = p_target_audience)
                AND (p_season IS NULL OR p.season = p_season)
                AND (p_launch_month IS NULL OR p.launch_month::text = p_launch_month)
                AND p.product_group IS NOT NULL
            ),
            'seasons', (
                SELECT json_agg(DISTINCT p.season)
                FROM bulk_inventory bi
                JOIN products p ON bi.product_id = p.id
                JOIN boxes b ON bi.box_id = b.id
                LEFT JOIN locations l ON b.location_id = l.id
                WHERE bi.quantity > 0
                AND (p_warehouse_id IS NULL OR l.warehouse_id = p_warehouse_id)
                AND (p_location_code IS NULL OR l.code = p_location_code)
                AND (p_box_code IS NULL OR b.code = p_box_code)
                AND (p_brand IS NULL OR p.brand = p_brand)
                AND (p_target_audience IS NULL OR p.target_audience = p_target_audience)
                AND (p_product_group IS NULL OR p.product_group = p_product_group)
                AND (p_launch_month IS NULL OR p.launch_month::text = p_launch_month)
                AND p.season IS NOT NULL
            ),
            'months', (
                SELECT json_agg(DISTINCT p.launch_month)
                FROM bulk_inventory bi
                JOIN products p ON bi.product_id = p.id
                JOIN boxes b ON bi.box_id = b.id
                LEFT JOIN locations l ON b.location_id = l.id
                WHERE bi.quantity > 0
                AND (p_warehouse_id IS NULL OR l.warehouse_id = p_warehouse_id)
                AND (p_location_code IS NULL OR l.code = p_location_code)
                AND (p_box_code IS NULL OR b.code = p_box_code)
                AND (p_brand IS NULL OR p.brand = p_brand)
                AND (p_target_audience IS NULL OR p.target_audience = p_target_audience)
                AND (p_product_group IS NULL OR p.product_group = p_product_group)
                AND (p_season IS NULL OR p.season = p_season)
                AND p.launch_month IS NOT NULL
            )
        )) INTO result;

    ELSE
        -- PIECE INVENTORY LOGIC (Existing + Updates)
        SELECT json_build_array(json_build_object(
            'locations', (
                SELECT json_agg(DISTINCT l.code)
                FROM inventory_items ii
                JOIN products p ON ii.product_id = p.id
                LEFT JOIN locations l ON ii.location_id = l.id
                LEFT JOIN boxes b ON ii.box_id = b.id
                WHERE ii.quantity > 0
                AND (p_warehouse_id IS NULL OR l.warehouse_id = p_warehouse_id)
                AND (p_box_code IS NULL OR b.code = p_box_code)
                AND (p_brand IS NULL OR p.brand = p_brand)
                AND (p_target_audience IS NULL OR p.target_audience = p_target_audience)
                AND (p_product_group IS NULL OR p.product_group = p_product_group)
                AND (p_season IS NULL OR p.season = p_season)
                AND (p_launch_month IS NULL OR p.launch_month::text = p_launch_month)
                AND l.code IS NOT NULL
            ),
            'boxes', (
                SELECT json_agg(DISTINCT b.code)
                FROM inventory_items ii
                JOIN products p ON ii.product_id = p.id
                JOIN boxes b ON ii.box_id = b.id
                LEFT JOIN locations l ON ii.location_id = l.id
                WHERE ii.quantity > 0
                AND (p_warehouse_id IS NULL OR l.warehouse_id = p_warehouse_id)
                AND (p_location_code IS NULL OR l.code = p_location_code)
                AND (p_brand IS NULL OR p.brand = p_brand)
                AND (p_target_audience IS NULL OR p.target_audience = p_target_audience)
                AND (p_product_group IS NULL OR p.product_group = p_product_group)
                AND (p_season IS NULL OR p.season = p_season)
                AND (p_launch_month IS NULL OR p.launch_month::text = p_launch_month)
                AND b.code IS NOT NULL
            ),
            'brands', (
                SELECT json_agg(DISTINCT p.brand)
                FROM inventory_items ii
                JOIN products p ON ii.product_id = p.id
                LEFT JOIN locations l ON ii.location_id = l.id
                LEFT JOIN boxes b ON ii.box_id = b.id
                WHERE ii.quantity > 0
                AND (p_warehouse_id IS NULL OR l.warehouse_id = p_warehouse_id)
                AND (p_location_code IS NULL OR l.code = p_location_code)
                AND (p_box_code IS NULL OR b.code = p_box_code)
                AND (p_target_audience IS NULL OR p.target_audience = p_target_audience)
                AND (p_product_group IS NULL OR p.product_group = p_product_group)
                AND (p_season IS NULL OR p.season = p_season)
                AND (p_launch_month IS NULL OR p.launch_month::text = p_launch_month)
                AND p.brand IS NOT NULL
            ),
            'targets', (
                SELECT json_agg(DISTINCT p.target_audience)
                FROM inventory_items ii
                JOIN products p ON ii.product_id = p.id
                LEFT JOIN locations l ON ii.location_id = l.id
                LEFT JOIN boxes b ON ii.box_id = b.id
                WHERE ii.quantity > 0
                AND (p_warehouse_id IS NULL OR l.warehouse_id = p_warehouse_id)
                AND (p_location_code IS NULL OR l.code = p_location_code)
                AND (p_box_code IS NULL OR b.code = p_box_code)
                AND (p_brand IS NULL OR p.brand = p_brand)
                AND (p_product_group IS NULL OR p.product_group = p_product_group)
                AND (p_season IS NULL OR p.season = p_season)
                AND (p_launch_month IS NULL OR p.launch_month::text = p_launch_month)
                AND p.target_audience IS NOT NULL
            ),
            'product_groups', (
                SELECT json_agg(DISTINCT p.product_group)
                FROM inventory_items ii
                JOIN products p ON ii.product_id = p.id
                LEFT JOIN locations l ON ii.location_id = l.id
                LEFT JOIN boxes b ON ii.box_id = b.id
                WHERE ii.quantity > 0
                AND (p_warehouse_id IS NULL OR l.warehouse_id = p_warehouse_id)
                AND (p_location_code IS NULL OR l.code = p_location_code)
                AND (p_box_code IS NULL OR b.code = p_box_code)
                AND (p_brand IS NULL OR p.brand = p_brand)
                AND (p_target_audience IS NULL OR p.target_audience = p_target_audience)
                AND (p_season IS NULL OR p.season = p_season)
                AND (p_launch_month IS NULL OR p.launch_month::text = p_launch_month)
                AND p.product_group IS NOT NULL
            ),
            'seasons', (
                SELECT json_agg(DISTINCT p.season)
                FROM inventory_items ii
                JOIN products p ON ii.product_id = p.id
                LEFT JOIN locations l ON ii.location_id = l.id
                LEFT JOIN boxes b ON ii.box_id = b.id
                WHERE ii.quantity > 0
                AND (p_warehouse_id IS NULL OR l.warehouse_id = p_warehouse_id)
                AND (p_location_code IS NULL OR l.code = p_location_code)
                AND (p_box_code IS NULL OR b.code = p_box_code)
                AND (p_brand IS NULL OR p.brand = p_brand)
                AND (p_target_audience IS NULL OR p.target_audience = p_target_audience)
                AND (p_product_group IS NULL OR p.product_group = p_product_group)
                AND (p_launch_month IS NULL OR p.launch_month::text = p_launch_month)
                AND p.season IS NOT NULL
            ),
            'months', (
                SELECT json_agg(DISTINCT p.launch_month)
                FROM inventory_items ii
                JOIN products p ON ii.product_id = p.id
                LEFT JOIN locations l ON ii.location_id = l.id
                LEFT JOIN boxes b ON ii.box_id = b.id
                WHERE ii.quantity > 0
                AND (p_warehouse_id IS NULL OR l.warehouse_id = p_warehouse_id)
                AND (p_location_code IS NULL OR l.code = p_location_code)
                AND (p_box_code IS NULL OR b.code = p_box_code)
                AND (p_brand IS NULL OR p.brand = p_brand)
                AND (p_target_audience IS NULL OR p.target_audience = p_target_audience)
                AND (p_product_group IS NULL OR p.product_group = p_product_group)
                AND (p_season IS NULL OR p.season = p_season)
                AND p.launch_month IS NOT NULL
            )
        )) INTO result;
    END IF;

    RETURN result;
END;
$$;
