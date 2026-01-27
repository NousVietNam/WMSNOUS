-- 1. Bổ sung cột warehouse_id vào bảng bulk_inventory để đồng bộ với inventory_items
ALTER TABLE public.bulk_inventory 
ADD COLUMN IF NOT EXISTS warehouse_id UUID;

-- 2. Cập nhật warehouse mặc định cho hàng sỉ (Lấy mã BULK từ bảng warehouses)
UPDATE public.bulk_inventory
SET warehouse_id = (SELECT id FROM warehouses WHERE code = 'BULK' LIMIT 1)
WHERE warehouse_id IS NULL;

-- 3. Xóa các hàm cũ để tạo lại với cấu trúc đúng
DROP FUNCTION IF EXISTS get_inventory_bulk_summary(uuid, text, text, text, text, text, text, text, text);
DROP FUNCTION IF EXISTS get_inventory_bulk_grouped(integer, integer, uuid, text, text, text, text, text, text, text, text);

-- 4. Tạo lại hàm Tổng hợp (Global Totals) - Đã bỏ tham chiếu l_box.warehouse_id (cột không tồn tại)
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
        LEFT JOIN boxes b ON bi.box_id = b.id
        LEFT JOIN locations l_box ON b.location_id = l_box.id
        LEFT JOIN locations l_direct ON bi.location_id = l_direct.id
        WHERE 
            bi.product_id IN (SELECT id FROM filtered_products) AND
            -- Sử dụng bi.warehouse_id (đã thêm ở trên)
            (p_warehouse_id IS NULL OR bi.warehouse_id = p_warehouse_id) AND
            (p_location_code IS NULL OR COALESCE(l_box.code, l_direct.code) = p_location_code) AND
            (p_box_code IS NULL OR b.code = p_box_code)
    )
    SELECT 
        (SELECT qty FROM bulk_stats)::numeric,
        (SELECT alloc FROM bulk_stats)::numeric,
        0::numeric, 0::numeric, 0::numeric, 0::numeric, -- Approved
        ((SELECT qty FROM bulk_stats) - (SELECT alloc FROM bulk_stats))::numeric,
        ((SELECT qty FROM bulk_stats) - (SELECT alloc FROM bulk_stats))::numeric
    ;
END;
$$;

-- 5. Tạo lại hàm Tab Tổng hợp (Grouped View)
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
        LEFT JOIN boxes b ON bi.box_id = b.id
        LEFT JOIN locations l_box ON b.location_id = l_box.id
        LEFT JOIN locations l_direct ON bi.location_id = l_direct.id
        WHERE 
            (p_warehouse_id IS NULL OR bi.warehouse_id = p_warehouse_id) AND
            (p_location_code IS NULL OR COALESCE(l_box.code, l_direct.code) = p_location_code) AND
            (p_box_code IS NULL OR b.code = p_box_code)
        GROUP BY bi.product_id
    ),
    final_set AS (
        SELECT 
            fp.id as p_id, fp.sku as p_sku, fp.name as p_name, fp.barcode as p_barcode, fp.image_url as p_image_url, fp.brand as p_brand,
            COALESCE(bd.total_qty, 0) as p_total_quantity, COALESCE(bd.total_alloc, 0) as p_total_allocated,
            0::numeric, 0::numeric, 0::numeric, 0::numeric,
            (COALESCE(bd.total_qty, 0) - COALESCE(bd.total_alloc, 0))::numeric as p_available,
            fp.target_audience, fp.product_group, fp.season, fp.launch_month
        FROM filtered_products fp
        JOIN bulk_data bd ON fp.id = bd.product_id
    ),
    total_cnt AS (SELECT COUNT(*) as cnt FROM final_set)
    SELECT fs.*, (SELECT cnt FROM total_cnt)::bigint, NULL::json FROM final_set fs
    ORDER BY fs.p_total_quantity DESC LIMIT p_page_size OFFSET v_offset;
END;
$$;

-- 6. Cập nhật process_bulk_putaway để tự động gán warehouse_id
CREATE OR REPLACE FUNCTION process_bulk_putaway(
    p_box_code TEXT,
    p_items JSONB,
    p_user_id UUID,
    p_reference TEXT DEFAULT 'Ton_dau_ky'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_box_id UUID;
    v_location_id UUID;
    v_warehouse_id UUID;
    v_item RECORD;
    v_real_product_id UUID;
    v_restricted_count INT;
BEGIN
    -- 1. Lấy thông tin Thùng và Warehouse mặc định của BULK
    SELECT id, location_id INTO v_box_id, v_location_id FROM boxes WHERE code = p_box_code;
    SELECT id INTO v_warehouse_id FROM warehouses WHERE code = 'BULK' LIMIT 1;
    
    IF v_box_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Không tìm thấy thùng ' || p_box_code);
    END IF;

    -- 2. Xử lý từng sản phẩm
    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(product_id UUID, "productId" UUID, qty INT, sku TEXT)
    LOOP
        v_real_product_id := COALESCE(v_item.product_id, v_item."productId");

        -- Kiểm tra danh mục Restricted
        SELECT COUNT(*) INTO v_restricted_count FROM restricted_inventory WHERE sku = v_item.sku;
        IF v_restricted_count = 0 THEN
            RAISE EXCEPTION 'Sản phẩm % không thuộc diện Kho Sỉ (Restricted).', v_item.sku;
        END IF;

        IF v_real_product_id IS NULL THEN
             RAISE EXCEPTION 'Lỗi: Không xác định được ID sản phẩm cho SKU %', v_item.sku;
        END IF;

        -- 3. Cộng dồn vào bulk_inventory (Kèm theo warehouse_id)
        INSERT INTO bulk_inventory (product_id, box_id, location_id, warehouse_id, quantity, created_at)
        VALUES (v_real_product_id, v_box_id, v_location_id, v_warehouse_id, v_item.qty, NOW())
        ON CONFLICT (product_id, box_id) 
        DO UPDATE SET 
            quantity = bulk_inventory.quantity + EXCLUDED.quantity,
            location_id = EXCLUDED.location_id,
            warehouse_id = EXCLUDED.warehouse_id,
            created_at = NOW();

        -- 4. Lưu lịch sử giao dịch
        INSERT INTO transactions (type, entity_type, to_box_id, to_location_id, quantity, sku, user_id, note, created_at)
        VALUES ('IMPORT', 'BULK', v_box_id, v_location_id, v_item.qty, v_item.sku, p_user_id, p_reference, NOW());
    END LOOP;

    RETURN jsonb_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION get_inventory_bulk_summary TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_inventory_bulk_grouped TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION process_bulk_putaway TO anon, authenticated, service_role;
NOTIFY pgrst, 'reload schema';
