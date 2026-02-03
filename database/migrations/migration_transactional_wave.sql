
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
    v_orders_count INT;
BEGIN
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

        -- Manually Trigger Metric Recalc (Just in case trigger misses bulk update, though ROW trigger should catch it)
        -- We trust the trigger on 'outbound_orders' to filter and update 'pick_waves'
        -- OR we can manually update here for performance/certainty?
        -- Let's trust the trigger we just fixed in Step 1411 (recalc_wave_metrics).
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
