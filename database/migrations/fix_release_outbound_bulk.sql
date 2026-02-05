-- Migration: Fix Release Outbound (Deallocate) for BULK inventory
-- Description: Updates release_outbound to correctly release allocated_quantity in bulk_inventory table.

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

    IF v_order.status NOT IN ('ALLOCATED', 'READY') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Chỉ có thể hủy phân bổ đơn đang ở trạng thái ALLOCATED hoặc READY (Hiện tại: ' || v_order.status || ')');
    END IF;

    -- Return items to inventory
    FOR v_task IN 
        SELECT pt.*, p.sku, b.inventory_type as box_inv_type
        FROM picking_tasks pt
        JOIN picking_jobs pj ON pt.job_id = pj.id
        JOIN products p ON pt.product_id = p.id
        LEFT JOIN boxes b ON pt.box_id = b.id
        WHERE pj.outbound_order_id = p_order_id 
          AND pt.status IN ('PENDING')
    LOOP
        -- RELEASE logic: Polymorphic (BULK vs PIECE)
        IF v_task.box_inv_type = 'BULK' THEN
            UPDATE bulk_inventory
            SET allocated_quantity = GREATEST(0, COALESCE(allocated_quantity, 0) - v_task.quantity)
            WHERE box_id = v_task.box_id AND product_id = v_task.product_id;
        ELSE
            UPDATE inventory_items
            SET allocated_quantity = GREATEST(0, COALESCE(allocated_quantity, 0) - v_task.quantity)
            WHERE box_id = v_task.box_id AND product_id = v_task.product_id;
        END IF;
        
        INSERT INTO transactions (type, entity_type, sku, quantity, reference_id, from_box_id, user_id, note, created_at)
        VALUES ('RELEASE', 'ITEM', v_task.sku, v_task.quantity, p_order_id, v_task.box_id, auth.uid(), 'Hủy phân bổ đơn ' || v_order.code, NOW());
    END LOOP;

    -- Cleanup Jobs/Tasks
    DELETE FROM picking_tasks WHERE job_id IN (SELECT id FROM picking_jobs WHERE outbound_order_id = p_order_id);
    DELETE FROM picking_jobs WHERE outbound_order_id = p_order_id;

    -- Update Order
    -- Revert to 'PENDING' status (is_approved stays TRUE)
    UPDATE outbound_orders 
    SET status = 'PENDING', 
        allocated_at = NULL 
    WHERE id = p_order_id;

    -- Also unlock any boxes locked for this order
    UPDATE boxes 
    SET status = 'OPEN', 
        outbound_order_id = NULL 
    WHERE outbound_order_id = p_order_id AND status = 'LOCKED';

    RETURN jsonb_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;
