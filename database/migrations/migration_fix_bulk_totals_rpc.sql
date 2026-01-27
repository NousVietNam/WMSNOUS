-- ==========================================
-- URGENT FIX: Inventory Totals & Summary for BULK
-- ==========================================

-- 1. Đảm bảo View khả dụng có đầy đủ cột (để không lỗi RPC)
CREATE OR REPLACE VIEW view_product_availability_bulk AS
SELECT
    bi.product_id,
    p.sku,
    p.name,
    p.image_url,
    p.barcode,
    SUM(bi.quantity) as total_quantity,
    SUM(COALESCE(bi.allocated_quantity, 0)) as total_allocated,
    -- Cột soft allocation (giả lập 0 nếu chưa có logic booking cho hàng sỉ)
    0::numeric as soft_booked_sale,
    0::numeric as soft_booked_gift,
    0::numeric as soft_booked_internal,
    0::numeric as soft_booked_transfer,
    SUM(bi.quantity - COALESCE(bi.allocated_quantity, 0))::numeric as available_quantity
FROM bulk_inventory bi
JOIN products p ON bi.product_id = p.id
GROUP BY bi.product_id, p.sku, p.name, p.image_url, p.barcode;

GRANT SELECT ON view_product_availability_bulk TO authenticated, service_role;

-- 2. Cập nhật RPC Tổng hợp (Global Totals) với SECURITY DEFINER
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
SECURITY DEFINER -- Quan trọng để vượt qua RLS nếu cần
AS $$
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
            (p_launch_month IS NULL OR p.launch_month = p_launch_month) AND
            (
                p_search IS NULL OR 
                p.sku ILIKE '%' || p_search || '%' OR 
                p.name ILIKE '%' || p_search || '%' OR
                p.barcode ILIKE '%' || p_search || '%'
            )
    ),
    bulk_stats AS (
        SELECT 
            COALESCE(SUM(bi.quantity), 0) as qty,
            COALESCE(SUM(bi.allocated_quantity), 0) as alloc
        FROM bulk_inventory bi
        LEFT JOIN boxes b ON bi.box_id = b.id
        LEFT JOIN locations l_box ON b.location_id = l_box.id
        LEFT JOIN locations l_direct ON bi.location_id = l_direct.id
        WHERE 
            bi.product_id IN (SELECT id FROM filtered_products) AND
            -- Kiểm tra warehouse_id trên location (bền vững hơn b.warehouse_id)
            (p_warehouse_id IS NULL OR COALESCE(l_box.warehouse_id, l_direct.warehouse_id) = p_warehouse_id) AND
            (p_location_code IS NULL OR COALESCE(l_box.code, l_direct.code) = p_location_code) AND
            (p_box_code IS NULL OR b.code = p_box_code)
    )
    SELECT 
        (SELECT qty FROM bulk_stats)::numeric,
        (SELECT alloc FROM bulk_stats)::numeric,
        0::numeric, -- total_approved_sale
        0::numeric, -- total_approved_gift
        0::numeric, -- total_approved_internal
        0::numeric, -- total_approved_transfer
        ((SELECT qty FROM bulk_stats) - (SELECT alloc FROM bulk_stats))::numeric, -- available_detail
        ((SELECT qty FROM bulk_stats) - (SELECT alloc FROM bulk_stats))::numeric  -- available_summary
    ;
END;
$$;

-- 3. Cập nhật RPC Tab Tổng hợp (Grouped View) với SECURITY DEFINER
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
        SELECT 
            bi.product_id,
            SUM(bi.quantity) as total_qty,
            SUM(COALESCE(bi.allocated_quantity, 0)) as total_alloc
        FROM bulk_inventory bi
        LEFT JOIN boxes b ON bi.box_id = b.id
        LEFT JOIN locations l_box ON b.location_id = l_box.id
        LEFT JOIN locations l_direct ON bi.location_id = l_direct.id
        WHERE 
            (p_warehouse_id IS NULL OR COALESCE(l_box.warehouse_id, l_direct.warehouse_id) = p_warehouse_id) AND
            (p_location_code IS NULL OR COALESCE(l_box.code, l_direct.code) = p_location_code) AND
            (p_box_code IS NULL OR b.code = p_box_code)
        GROUP BY bi.product_id
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
            0::numeric as p_soft_sale,
            0::numeric as p_soft_gift,
            0::numeric as p_soft_internal,
            0::numeric as p_soft_transfer,
            (COALESCE(bd.total_qty, 0) - COALESCE(bd.total_alloc, 0))::numeric as p_available,
            fp.target_audience as p_target_audience,
            fp.product_group as p_product_group,
            fp.season as p_season,
            fp.launch_month as p_launch_month
        FROM filtered_products fp
        JOIN bulk_data bd ON fp.id = bd.product_id -- Chỉ lấy SP có tồn sỉ
    ),
    total_cnt AS (
        SELECT COUNT(*) as cnt FROM final_set
    )
    SELECT 
        fs.*,
        (SELECT cnt FROM total_cnt)::bigint as total_count,
        NULL::json as location_details
    FROM final_set fs
    ORDER BY fs.p_total_quantity DESC
    LIMIT p_page_size OFFSET v_offset;
END;
$$;

GRANT EXECUTE ON FUNCTION get_inventory_bulk_summary TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_inventory_bulk_grouped TO anon, authenticated, service_role;
NOTIFY pgrst, 'reload schema';
