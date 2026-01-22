-- Improvements for release_outbound RPC
-- 1. Add check if order exists (Return clear error)
-- 2. Ensure it handles the new picking_jobs 'PLANNED' status correctly.
-- 3. SAFETY: Explicitly DROP to avoid overloading collisions.
-- 4. LOGIC FIX: Revert status to 'PENDING' (not 'APPROVED') on release.

DROP FUNCTION IF EXISTS release_outbound(UUID);
DROP FUNCTION IF EXISTS release_outbound(TEXT);

CREATE OR REPLACE FUNCTION release_outbound(p_order_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_order RECORD;
    v_task RECORD;
BEGIN
    SELECT * INTO v_order FROM outbound_orders WHERE id = p_order_id;
    
    IF v_order IS NULL THEN
         RETURN jsonb_build_object('success', false, 'error', 'Không tìm thấy đơn hàng (ID: ' || COALESCE(p_order_id::text, 'NULL') || ')');
    END IF;

    IF v_order.status != 'ALLOCATED' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Chỉ có thể hủy phân bổ đơn đang ở trạng thái ALLOCATED (Hiện tại: ' || v_order.status || ')');
    END IF;

    -- Return items to inventory
    FOR v_task IN 
        SELECT pt.*, p.sku 
        FROM picking_tasks pt
        JOIN picking_jobs pj ON pt.job_id = pj.id
        JOIN products p ON pt.product_id = p.id
        WHERE pj.outbound_order_id = p_order_id 
          AND pj.status IN ('PLANNED', 'PENDING', 'OPEN')
    LOOP
        UPDATE inventory_items
        SET allocated_quantity = GREATEST(0, COALESCE(allocated_quantity, 0) - v_task.quantity)
        WHERE box_id = v_task.box_id AND product_id = v_task.product_id;
        
        INSERT INTO transactions (type, entity_type, sku, quantity, reference_id, from_box_id, user_id, note, created_at)
        VALUES ('RELEASE', 'ITEM', v_task.sku, v_task.quantity, p_order_id, v_task.box_id, auth.uid(), 'Hủy phân bổ đơn ' || v_order.code, NOW());
    END LOOP;

    -- Cleanup Jobs/Tasks
    DELETE FROM picking_tasks WHERE job_id IN (SELECT id FROM picking_jobs WHERE outbound_order_id = p_order_id);
    DELETE FROM picking_jobs WHERE outbound_order_id = p_order_id;

    -- Update Order
    -- Fix: Revert to 'PENDING' status, but keep is_approved = TRUE
    UPDATE outbound_orders 
    SET status = 'PENDING', 
        allocated_at = NULL 
    WHERE id = p_order_id;

    RETURN jsonb_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;
