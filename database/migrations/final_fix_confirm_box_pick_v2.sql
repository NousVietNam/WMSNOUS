-- Final Robust Fix for confirm_box_pick RPC
CREATE OR REPLACE FUNCTION confirm_box_pick(
    p_box_id UUID,
    p_job_id UUID,
    p_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_task RECORD;
    v_job RECORD;
    v_gate_out_id UUID;
    v_success_count INT := 0;
BEGIN
    -- 1. Get Job & Order Context
    SELECT * INTO v_job FROM picking_jobs WHERE id = p_job_id;
    IF v_job IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Không tìm thấy Job ID: ' || COALESCE(p_job_id::text, 'null'));
    END IF;

    -- Get GATE-OUT ID
    SELECT id INTO v_gate_out_id FROM locations WHERE code = 'GATE-OUT' LIMIT 1;
    -- Note: If GATE-OUT doesn't exist, we skip the move but still process tasks
    
    -- 2. Move Box to GATE-OUT if possible
    IF v_gate_out_id IS NOT NULL THEN
        UPDATE boxes SET location_id = v_gate_out_id, updated_at = NOW() WHERE id = p_box_id;
    END IF;

    -- 3. Process Tasks: Case-insensitive status check and standardized update
    FOR v_task IN 
        SELECT id, quantity, order_item_id FROM picking_tasks 
        WHERE job_id = p_job_id AND box_id = p_box_id AND status ILIKE 'PENDING' 
    LOOP
        -- Update Task: explicitly set to 'COMPLETED'
        UPDATE picking_tasks 
        SET status = 'COMPLETED',
            picked_at = NOW(), 
            picked_by = p_user_id 
        WHERE id = v_task.id;

        -- Polymorphic Update for Order Items
        UPDATE outbound_order_items 
        SET picked_quantity = COALESCE(picked_quantity, 0) + v_task.quantity 
        WHERE id = v_task.order_item_id;

        UPDATE order_items 
        SET picked_quantity = COALESCE(picked_quantity, 0) + v_task.quantity 
        WHERE id = v_task.order_item_id;

        UPDATE transfer_order_items 
        SET picked_quantity = COALESCE(picked_quantity, 0) + v_task.quantity 
        WHERE id = v_task.order_item_id;

        v_success_count := v_success_count + 1;
    END LOOP;

    -- 4. Update Order Status to PICKING
    IF v_job.outbound_order_id IS NOT NULL THEN
        UPDATE outbound_orders 
        SET status = 'PICKING', updated_at = NOW() 
        WHERE id = v_job.outbound_order_id AND status IN ('ALLOCATED', 'READY');
    END IF;

    -- 5. Return summary
    RETURN jsonb_build_object(
        'success', true, 
        'processed', v_success_count,
        'box_id', p_box_id,
        'job_id', p_job_id
    );
END;
$$;
