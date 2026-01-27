
-- Create RPC to group Bulk Inventory by Product
-- Mirrored from get_inventory_grouped but uses view_product_availability_bulk

CREATE OR REPLACE FUNCTION get_inventory_bulk_grouped(
    p_page integer DEFAULT 0,
    p_page_size integer DEFAULT 50,
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
    product_id uuid,
    sku text,
    name text,
    barcode text,
    image_url text,
    brand text,
    total_quantity bigint,
    total_allocated bigint,
    soft_sale numeric,
    soft_gift numeric,
    soft_internal numeric,
    soft_transfer numeric,
    available_quantity numeric,
    total_count bigint,
    target_audience text,
    product_group text,
    season text,
    launch_month text,
    location_details json
) AS $$
DECLARE
    v_offset integer;
BEGIN
    v_offset := p_page * p_page_size;

    RETURN QUERY
    WITH filtered_products AS (
        SELECT 
            p.id,
            p.sku,
            p.name,
            p.barcode,
            p.image_url,
            p.brand,
            p.target_audience,
            p.product_group,
            p.season,
            p.launch_month
        FROM products p
        WHERE 
            (p_brand IS NULL OR p.brand = p_brand) AND
            (p_target_audience IS NULL OR p.target_audience = p_target_audience) AND
            (p_product_group IS NULL OR p.product_group = p_product_group) AND
            (p_season IS NULL OR p.season = p_season) AND
            (p_launch_month IS NULL OR p.launch_month = p_launch_month) AND
            (
                p_search IS NULL OR 
                p.sku ILIKE '%' || p_search || '%' OR 
                p.name ILIKE '%' || p_search || '%' OR
                p.barcode ILIKE '%' || p_search || '%'
            )
    ),
    bulk_data AS (
        SELECT 
            bi.product_id,
            SUM(bi.quantity) as total_qty,
            SUM(bi.allocated_quantity) as total_alloc
        FROM bulk_inventory bi
        JOIN boxes b ON bi.box_id = b.id
        LEFT JOIN locations l ON b.location_id = l.id
        WHERE 
            (p_warehouse_id IS NULL OR b.warehouse_id = p_warehouse_id) AND
            (p_location_code IS NULL OR l.code = p_location_code) AND
            (p_box_code IS NULL OR b.code = p_box_code)
        GROUP BY bi.product_id
    ),
    -- Get Soft Allocation from View (Aggregated per product)
    view_data AS (
        SELECT 
            v.product_id, 
            v.soft_booked_sale,
            v.soft_booked_gift,
            v.soft_booked_internal,
            v.soft_booked_transfer
        FROM view_product_availability_bulk v
    ),
    final_set AS (
        SELECT 
            fp.id as p_id,
            fp.sku as p_sku,
            fp.name as p_name,
            fp.barcode as p_barcode,
            fp.image_url as p_image_url,
            fp.brand as p_brand,
            COALESCE(bd.total_qty, 0) as p_total_quantity,
            COALESCE(bd.total_alloc, 0) as p_total_allocated,
            COALESCE(vd.soft_booked_sale, 0) as p_soft_sale,
            COALESCE(vd.soft_booked_gift, 0) as p_soft_gift,
            COALESCE(vd.soft_booked_internal, 0) as p_soft_internal,
            COALESCE(vd.soft_booked_transfer, 0) as p_soft_transfer,
            GREATEST(0, COALESCE(bd.total_qty, 0) - COALESCE(bd.total_alloc, 0) - COALESCE(vd.soft_booked_sale, 0) - COALESCE(vd.soft_booked_gift, 0) - COALESCE(vd.soft_booked_internal, 0) - COALESCE(vd.soft_booked_transfer, 0)) as p_available,
            fp.target_audience as p_target_audience,
            fp.product_group as p_product_group,
            fp.season as p_season,
            fp.launch_month as p_launch_month
        FROM filtered_products fp
        JOIN bulk_data bd ON fp.id = bd.product_id -- Inner join to only show products with bulk inventory matching location filters
        LEFT JOIN view_data vd ON fp.id = vd.product_id
    )
    SELECT 
        fs.p_id,
        fs.p_sku,
        fs.p_name,
        fs.p_barcode,
        fs.p_image_url,
        fs.p_brand,
        fs.p_total_quantity,
        fs.p_total_allocated,
        fs.p_soft_sale,
        fs.p_soft_gift,
        fs.p_soft_internal,
        fs.p_soft_transfer,
        fs.p_available,
        (SELECT COUNT(*) FROM final_set)::bigint as total_count,
        fs.p_target_audience,
        fs.p_product_group,
        fs.p_season,
        fs.p_launch_month,
        NULL::json as location_details -- Placeholder for now, can implement if needed
    FROM final_set fs
    ORDER BY fs.p_total_quantity DESC
    LIMIT p_page_size OFFSET v_offset;
END;
$$ LANGUAGE plpgsql;
