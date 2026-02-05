
-- Drop old version to clean up signature
DROP FUNCTION IF EXISTS create_wave(text, uuid, text);
DROP FUNCTION IF EXISTS create_wave(text, uuid, text, uuid[]);

-- Create Transactional Wave Creator
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
    v_mmyy TEXT;
    v_seq INT;
    v_orders_count INT := 0;
BEGIN
    -- 1. Generate Code: Wave-mmyy-xxxx
    v_mmyy := to_char(NOW(), 'MMYY');
    
    -- Lấy số thứ tự lớn nhất trong tháng hiện tại (Wave-MMYY-XXXX)
    SELECT COALESCE(MAX(SUBSTRING(code FROM 11 FOR 4)::INT), 0) + 1 INTO v_seq 
    FROM pick_waves 
    WHERE code LIKE 'Wave-' || v_mmyy || '-%';
    
    v_code := 'Wave-' || v_mmyy || '-' || lpad(v_seq::text, 4, '0');
    
    -- 2. Insert Wave Header
    INSERT INTO pick_waves (code, inventory_type, created_by, description)
    VALUES (v_code, p_inventory_type, p_user_id, p_description)
    RETURNING id INTO v_wave_id;
    
    IF p_order_ids IS NOT NULL AND array_length(p_order_ids, 1) > 0 THEN
        -- Only update orders that are PENDING, APPROVED, and NOT already in a wave
        UPDATE outbound_orders
        SET wave_id = v_wave_id
        WHERE id = ANY(p_order_ids)
          AND status = 'PENDING'
          AND is_approved = TRUE
          AND wave_id IS NULL;
        
        GET DIAGNOSTICS v_orders_count = ROW_COUNT;
        
        -- Strict Validation: Ensure all requested orders were linked
        IF v_orders_count < array_length(p_order_ids, 1) THEN
            RAISE EXCEPTION 'Một số đơn hàng không hợp lệ để tạo Wave (Phải ở trạng thái PENDING, ĐÃ DUYỆT và chưa thuộc Wave nào).';
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'success', true, 
        'wave_id', v_wave_id, 
        'code', v_code,
        'linked_orders', v_orders_count
    );
EXCEPTION WHEN OTHERS THEN
    RAISE;
END;
$$;
