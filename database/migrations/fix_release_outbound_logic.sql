-- Fix Release Outbound RPC
CREATE OR REPLACE FUNCTION release_outbound(p_order_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_order RECORD;
    v_task RECORD;
BEGIN
    SELECT * INTO v_order FROM outbound_orders WHERE id = p_order_id FOR UPDATE;
    
    IF v_order IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Không tìm thấy đơn hàng');
    END IF;

    -- Allow release if status is ALLOCATED or READY (if job hasn't started)
    IF v_order.status NOT IN ('ALLOCATED', 'READY') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Chỉ có thể hủy phân bổ đơn đang ở trạng thái ALLOCATED hoặc READY (chưa nhặt)');
    END IF;

    -- 1. Loop through tasks to release inventory and LOG transactions
    FOR v_task IN 
        SELECT pt.*, p.sku 
        FROM picking_tasks pt
        JOIN picking_jobs pj ON pt.job_id = pj.id
        JOIN products p ON pt.product_id = p.id
        WHERE pj.outbound_order_id = p_order_id 
          AND pj.status IN ('PLANNED', 'OPEN') -- Only release if not in progress
    LOOP
        -- Revert allocation in inventory_items
        -- (Note: Trigger tr_picking_allocation will also handle this if we delete the task, 
        -- but we do it explicitly here for safety and to control the log)
        UPDATE inventory_items
        SET allocated_quantity = GREATEST(0, COALESCE(allocated_quantity, 0) - v_task.quantity)
        WHERE box_id = v_task.box_id AND product_id = v_task.product_id;
        
        -- Log RELEASE transaction (This is the official place for it)
        INSERT INTO transactions (type, entity_type, sku, quantity, reference_id, from_box_id, user_id, note, created_at)
        VALUES ('RELEASE', 'ITEM', v_task.sku, v_task.quantity, p_order_id, v_task.box_id, auth.uid(), 'Hủy phân bổ đơn ' || v_order.code, NOW());
    END LOOP;

    -- 2. Delete the picking jobs and tasks
    -- We delete ALL jobs for this order if they were not started/completed
    DELETE FROM picking_jobs 
    WHERE outbound_order_id = p_order_id 
      AND status IN ('PLANNED', 'OPEN');

    -- 3. Reset Order Status
    UPDATE outbound_orders 
    SET status = 'PENDING', 
        allocated_at = NULL,
        updated_at = NOW()
    WHERE id = p_order_id;

    RETURN jsonb_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;
