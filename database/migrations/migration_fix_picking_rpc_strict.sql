-- Migration: Fix confirm_picking_batch to be strict about source inventory
-- Description: Raises exception if source inventory is not found, preventing tasks from completing without moving items.

CREATE OR REPLACE FUNCTION confirm_picking_batch(
    p_task_ids UUID[],
    p_outbox_id UUID,
    p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_task_id UUID;
    v_task RECORD;
    v_inv_source RECORD;
    v_inv_dest RECORD;
    v_outbound_order_id UUID;
    v_success_count INT := 0;
    v_outbox_code TEXT;
BEGIN
    -- Validate outbox
    SELECT code INTO v_outbox_code FROM boxes WHERE id = p_outbox_id AND type = 'OUTBOX';
    IF v_outbox_code IS NULL THEN 
        RETURN jsonb_build_object('success', false, 'error', 'Outbox không hợp lệ'); 
    END IF;

    FOREACH v_task_id IN ARRAY p_task_ids LOOP
        -- Lock Task & Get Job Info
        SELECT pt.*, pj.outbound_order_id INTO v_task 
        FROM picking_tasks pt 
        JOIN picking_jobs pj ON pt.job_id = pj.id
        WHERE pt.id = v_task_id FOR UPDATE;

        IF v_task IS NULL OR v_task.status = 'COMPLETED' THEN CONTINUE; END IF;
        v_outbound_order_id := v_task.outbound_order_id;

        -- A. Source Inventory Deduction
        -- Try to find exact match in source box
        SELECT * INTO v_inv_source FROM inventory_items 
        WHERE box_id = v_task.box_id AND product_id = v_task.product_id 
        ORDER BY quantity DESC LIMIT 1 FOR UPDATE;

        IF v_inv_source IS NULL THEN
             -- FAIL LOUDLY if source inventory is missing
             RAISE EXCEPTION 'Không tìm thấy tồn kho nguồn cho sản phẩm % trong thùng %', v_task.product_id, v_task.box_id;
        END IF;

        IF v_inv_source.quantity < v_task.quantity THEN
             RAISE EXCEPTION 'Không đủ tồn kho nguồn (Có: %, Cần: %) cho sản phẩm %', v_inv_source.quantity, v_task.quantity, v_task.product_id;
        END IF;

        -- Deduct Source
        UPDATE inventory_items 
        SET quantity = quantity - v_task.quantity, 
            allocated_quantity = GREATEST(0, COALESCE(allocated_quantity, 0) - v_task.quantity) 
        WHERE id = v_inv_source.id;
        
        -- B. Destination Inventory Addition (Outbox)
        SELECT * INTO v_inv_dest FROM inventory_items 
        WHERE box_id = p_outbox_id AND product_id = v_task.product_id FOR UPDATE;
        
        IF v_inv_dest IS NOT NULL THEN
            UPDATE inventory_items 
            SET quantity = quantity + v_task.quantity,
                allocated_quantity = COALESCE(allocated_quantity, 0) + v_task.quantity
            WHERE id = v_inv_dest.id;
        ELSE
            INSERT INTO inventory_items (box_id, product_id, quantity, allocated_quantity) 
            VALUES (p_outbox_id, v_task.product_id, v_task.quantity, v_task.quantity);
        END IF;
        
        -- C. Cleanup empty source
        DELETE FROM inventory_items WHERE id = v_inv_source.id AND quantity <= 0 AND allocated_quantity <= 0;

        -- D. Update Task Status
        UPDATE picking_tasks 
        SET status = 'COMPLETED', outbox_id = p_outbox_id, outbox_code = v_outbox_code, picked_at = NOW(), picked_by = p_user_id 
        WHERE id = v_task_id;
        
        -- E. Update progress in order items
        UPDATE outbound_order_items SET picked_quantity = COALESCE(picked_quantity, 0) + v_task.quantity WHERE id = v_task.order_item_id;
        
        -- F. Log Internal Move Transaction
        INSERT INTO transactions (type, entity_type, sku, quantity, from_box_id, to_box_id, user_id, reference_id, note, created_at)
        VALUES (
            'MOVE', 'ITEM', 
            (SELECT sku FROM products WHERE id = v_task.product_id), 
            v_task.quantity, v_task.box_id, p_outbox_id, p_user_id, v_outbound_order_id,
            'Soạn hàng đơn ' || (SELECT code FROM outbound_orders WHERE id = v_outbound_order_id),
            NOW()
        );
        
        v_success_count := v_success_count + 1;
    END LOOP;

    -- G. Link Outbox to Order
    IF v_outbound_order_id IS NOT NULL THEN
        UPDATE boxes SET outbound_order_id = v_outbound_order_id WHERE id = p_outbox_id;
        UPDATE outbound_orders SET status = 'PICKING' WHERE id = v_outbound_order_id AND status IN ('PENDING', 'APPROVED', 'ALLOCATED', 'READY');
    END IF;

    RETURN jsonb_build_object('success', true, 'processed', v_success_count);
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;
