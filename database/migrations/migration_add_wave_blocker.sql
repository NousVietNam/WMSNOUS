
CREATE OR REPLACE FUNCTION create_wave(
    p_inventory_type TEXT,
    p_user_id UUID,
    p_description TEXT DEFAULT NULL,
    p_order_ids UUID[] DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_wave_id UUID;
    v_code TEXT;
    v_orders_count INT;
    v_conflict_order TEXT;
BEGIN
    -- 0. BLOCKER: Check if any order is already in a Wave
    IF p_order_ids IS NOT NULL AND array_length(p_order_ids, 1) > 0 THEN
        SELECT code INTO v_conflict_order
        FROM outbound_orders
        WHERE id = ANY(p_order_ids) 
          AND wave_id IS NOT NULL
        LIMIT 1;

        IF v_conflict_order IS NOT NULL THEN
            RAISE EXCEPTION 'Đơn hàng % đã thuộc về Wave khác. Vui lòng gỡ khỏi Wave cũ trước khi thêm vào Wave mới.', v_conflict_order;
        END IF;
    END IF;

    -- 1. Generate Code: W-YYMMDD-XXXX
    v_code := 'W-' || to_char(NOW(), 'YYMMDD') || '-' || upper(substring(md5(random()::text) from 1 for 4));
    
    -- 2. Insert Wave Header
    INSERT INTO pick_waves (code, inventory_type, created_by, description)
    VALUES (v_code, p_inventory_type, p_user_id, p_description)
    RETURNING id INTO v_wave_id;
    
    -- 3. Link Orders (Transactional)
    IF p_order_ids IS NOT NULL AND array_length(p_order_ids, 1) > 0 THEN
        UPDATE outbound_orders
        SET wave_id = v_wave_id
        WHERE id = ANY(p_order_ids);
        
        GET DIAGNOSTICS v_orders_count = ROW_COUNT;
        
        -- Optional: Validation
        IF v_orders_count = 0 THEN
            RAISE EXCEPTION 'No valid orders found to link to wave.';
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'success', true, 
        'wave_id', v_wave_id, 
        'code', v_code,
        'linked_orders', v_orders_count
    );
EXCEPTION WHEN OTHERS THEN
    -- If any error, the whole transaction rolls back automatically
    RAISE;
END;
$$;
