-- 1. Xóa các hàm cũ để tạo lại với cấu trúc đúng hoàn toàn
DROP FUNCTION IF EXISTS get_inventory_bulk_summary(uuid, text, text, text, text, text, text, text, text);
DROP FUNCTION IF EXISTS get_inventory_bulk_grouped(integer, integer, uuid, text, text, text, text, text, text, text, text);

-- 2. Tạo lại hàm Tổng hợp (Global Totals)
CREATE OR REPLACE FUNCTION get_inventory_bulk_summary(
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
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    WITH filtered_products AS (
        SELECT p.id FROM products p
        WHERE 
            (p_brand IS NULL OR p.brand = p_brand) AND
            (p_target_audience IS NULL OR p.target_audience = p_target_audience) AND
            (p_product_group IS NULL OR p.product_group = p_product_group) AND
            (p_season IS NULL OR p.season = p_season) AND
            (p_launch_month IS NULL OR p.launch_month = p_launch_month) AND
            (p_search IS NULL OR p.sku ILIKE '%' || p_search || '%' OR p.name ILIKE '%' || p_search || '%')
    ),
    bulk_stats AS (
        SELECT 
            COALESCE(SUM(bi.quantity), 0) as qty,
            COALESCE(SUM(bi.allocated_quantity), 0) as alloc
        FROM bulk_inventory bi
        WHERE 
            bi.product_id IN (SELECT id FROM filtered_products) AND
            (p_warehouse_id IS NULL OR bi.warehouse_id = p_warehouse_id) AND
            (p_location_code IS NULL OR EXISTS (
                SELECT 1 FROM locations l 
                WHERE l.id = bi.location_id AND l.code = p_location_code
            )) AND
            (p_box_code IS NULL OR EXISTS (
                SELECT 1 FROM boxes b 
                WHERE b.id = bi.box_id AND b.code = p_box_code
            ))
    )
    SELECT 
        (SELECT qty FROM bulk_stats)::numeric,
        (SELECT alloc FROM bulk_stats)::numeric,
        0::numeric, 0::numeric, 0::numeric, 0::numeric,
        ((SELECT qty FROM bulk_stats) - (SELECT alloc FROM bulk_stats))::numeric,
        ((SELECT qty FROM bulk_stats) - (SELECT alloc FROM bulk_stats))::numeric
    ;
END;
$$;

-- 3. Tạo lại hàm Tab Tổng hợp (Grouped View) - SỬA THỨ TỰ CỘT ĐỂ KHỚP RETURNS TABLE
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
    product_id uuid, sku text, name text, barcode text, image_url text, brand text,
    total_quantity bigint, total_allocated bigint,
    soft_sale numeric, soft_gift numeric, soft_internal numeric, soft_transfer numeric,
    available_quantity numeric, total_count bigint,
    target_audience text, product_group text, season text, launch_month text, location_details json
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_offset integer;
BEGIN
    v_offset := p_page * p_page_size;
    RETURN QUERY
    WITH filtered_products AS (
        SELECT p.* FROM products p
        WHERE 
            (p_brand IS NULL OR p.brand = p_brand) AND 
            (p_target_audience IS NULL OR p.target_audience = p_target_audience) AND 
            (p_product_group IS NULL OR p.product_group = p_product_group) AND 
            (p_season IS NULL OR p.season = p_season) AND 
            (p_launch_month IS NULL OR p.launch_month = p_launch_month) AND 
            (p_search IS NULL OR p.sku ILIKE '%' || p_search || '%' OR p.name ILIKE '%' || p_search || '%')
    ),
    bulk_data AS (
        SELECT bi.product_id, SUM(bi.quantity) as total_qty, SUM(COALESCE(bi.allocated_quantity, 0)) as total_alloc
        FROM bulk_inventory bi
        WHERE 
            (p_warehouse_id IS NULL OR bi.warehouse_id = p_warehouse_id) AND
            (p_location_code IS NULL OR EXISTS (SELECT 1 FROM locations l WHERE l.id = bi.location_id AND l.code = p_location_code)) AND
            (p_box_code IS NULL OR EXISTS (SELECT 1 FROM boxes b WHERE b.id = bi.box_id AND b.code = p_box_code))
        GROUP BY bi.product_id
    ),
    final_set AS (
        SELECT 
            fp.id as p_id, fp.sku as p_sku, fp.name as p_name, fp.barcode as p_barcode, fp.image_url as p_image_url, fp.brand as p_brand,
            COALESCE(bd.total_qty, 0) as p_total_quantity, COALESCE(bd.total_alloc, 0) as p_total_allocated,
            0::numeric as p_soft_sale, 0::numeric as p_soft_gift, 0::numeric as p_soft_internal, 0::numeric as p_soft_transfer,
            (COALESCE(bd.total_qty, 0) - COALESCE(bd.total_alloc, 0))::numeric as p_available,
            fp.target_audience, fp.product_group, fp.season, fp.launch_month
        FROM filtered_products fp
        JOIN bulk_data bd ON fp.id = bd.product_id
    ),
    total_cnt AS (SELECT COUNT(*) as cnt FROM final_set)
    SELECT 
        fs.p_id, fs.p_sku, fs.p_name, fs.p_barcode, fs.p_image_url, fs.p_brand,
        fs.p_total_quantity::bigint, fs.p_total_allocated::bigint,
        fs.p_soft_sale, fs.p_soft_gift, fs.p_soft_internal, fs.p_soft_transfer,
        fs.p_available, 
        (SELECT cnt FROM total_cnt)::bigint as total_count, -- Cột 14
        fs.target_audience, fs.product_group, fs.season, fs.launch_month, -- Các cột thông tin SP
        NULL::json as location_details -- Cột 19
    FROM final_set fs
    ORDER BY fs.p_total_quantity DESC LIMIT p_page_size OFFSET v_offset;
END;
$$;

GRANT EXECUTE ON FUNCTION get_inventory_bulk_summary TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_inventory_bulk_grouped TO anon, authenticated, service_role;
NOTIFY pgrst, 'reload schema';
