-- Update process_bulk_putaway to bypass restricted inventory check for special boxes (BOX-00031 prefix)
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
    v_item RECORD;
    v_real_product_id UUID;
    v_restricted_count INT;
BEGIN
    -- 1. Kiểm tra thùng và lấy Vị trí
    SELECT id, location_id INTO v_box_id, v_location_id FROM boxes WHERE code = p_box_code;

    IF v_box_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Không tìm thấy thùng ' || p_box_code);
    END IF;

    -- 2. Xử lý từng sản phẩm
    -- Record mapping: product_id (snake_case) hoặc "productId" (CamelCase)
    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(product_id UUID, "productId" UUID, qty INT, sku TEXT)
    LOOP
        -- Lấy ID sản phẩm thực tế (COALESCE để chấp nhận cả 2 kiểu đặt tên JSON)
        v_real_product_id := COALESCE(v_item.product_id, v_item."productId");

        -- Kiểm tra danh mục Restricted (Bỏ qua nếu thùng là BOX-00031...)
        IF NOT (p_box_code ILIKE 'BOX-00031%') THEN
            SELECT COUNT(*) INTO v_restricted_count FROM restricted_inventory WHERE sku = v_item.sku;

            IF v_restricted_count = 0 THEN
                RAISE EXCEPTION 'Sản phẩm % không thuộc diện Kho Sỉ (Restricted).', v_item.sku;
            END IF;
        END IF;

        IF v_real_product_id IS NULL THEN
             RAISE EXCEPTION 'Lỗi: Không xác định được ID sản phẩm cho SKU % (productId is NULL)', v_item.sku;
        END IF;

        -- 3. Cộng dồn vào bulk_inventory (Bổ sung location_id để hiển thị vị trí)
        INSERT INTO bulk_inventory (product_id, box_id, location_id, quantity, created_at)
        VALUES (v_real_product_id, v_box_id, v_location_id, v_item.qty, NOW())
        ON CONFLICT (product_id, box_id)
        DO UPDATE SET
            quantity = bulk_inventory.quantity + EXCLUDED.quantity,
            location_id = EXCLUDED.location_id,
            created_at = NOW();

        -- 4. Lưu lịch sử giao dịch (Bổ sung to_location_id)
        INSERT INTO transactions (type, entity_type, to_box_id, to_location_id, quantity, sku, user_id, note, created_at)
        VALUES ('IMPORT', 'BULK', v_box_id, v_location_id, v_item.qty, v_item.sku, p_user_id, p_reference, NOW());
    END LOOP;

    RETURN jsonb_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION process_bulk_putaway TO anon, authenticated, service_role;
NOTIFY pgrst, 'reload schema';
