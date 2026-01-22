-- Standardize confirm_box_pick RPC
CREATE OR REPLACE FUNCTION confirm_box_pick(
    p_box_id UUID,
    p_job_id UUID,
    p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_task RECORD;
    v_outbound_order_id UUID;
    v_success_count INT := 0;
BEGIN
    -- 1. Get Job Context
    SELECT outbound_order_id INTO v_outbound_order_id FROM picking_jobs WHERE id = p_job_id;

    -- 2. Process Tasks: Standardize status to 'COMPLETED' (Frontend expected value)
    FOR v_task IN 
        SELECT id, quantity, order_item_id 
        FROM picking_tasks 
        WHERE job_id = p_job_id AND box_id = p_box_id AND status = 'PENDING' 
    LOOP
        -- Update Task
        UPDATE picking_tasks 
        SET status = 'COMPLETED', -- UI expects COMPLETED
            picked_at = NOW(), 
            picked_by = p_user_id 
        WHERE id = v_task.id;

        -- Update Order Item progress
        -- Note: Table name is outbound_order_items in unified schema
        UPDATE outbound_order_items 
        SET picked_quantity = COALESCE(picked_quantity, 0) + v_task.quantity 
        WHERE id = v_task.order_item_id;

        v_success_count := v_success_count + 1;
    END LOOP;

    -- 3. Update Order Status
    IF v_outbound_order_id IS NOT NULL THEN
        UPDATE outbound_orders 
        SET status = 'PICKING',
            updated_at = NOW()
        WHERE id = v_outbound_order_id AND status IN ('ALLOCATED', 'READY');
    END IF;

    RETURN jsonb_build_object('success', true, 'processed', v_success_count);
END;
$$;
