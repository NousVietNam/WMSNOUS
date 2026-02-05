-- Migration: Fix Picking RPC Locking Error
-- Description: Resolves "FOR UPDATE cannot be applied to the nullable side of an outer join" by specifying target tables for locking.

-- A. FIX confirm_picking_batch
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
    v_inv_source_standard RECORD;
    v_inv_source_bulk RECORD;
    v_inv_dest RECORD;
    v_outbound_order_id UUID;
    v_success_count INT := 0;
    v_outbox_code TEXT;
    v_box_inv_type TEXT;
BEGIN
    SELECT code INTO v_outbox_code FROM boxes WHERE id = p_outbox_id AND type = 'OUTBOX';
    IF v_outbox_code IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Outbox không hợp lệ'); END IF;

    FOREACH v_task_id IN ARRAY p_task_ids LOOP
        -- FIXED: Specify OF pt, pj to avoid locking the nullable side (boxes b) of the JOIN
        SELECT pt.*, pj.outbound_order_id, b.inventory_type as box_inv_type 
        INTO v_task FROM picking_tasks pt 
        JOIN picking_jobs pj ON pt.job_id = pj.id
        LEFT JOIN boxes b ON pt.box_id = b.id
        WHERE pt.id = v_task_id 
        FOR UPDATE OF pt, pj;

        IF v_task IS NULL OR v_task.status = 'COMPLETED' THEN CONTINUE; END IF;
        v_outbound_order_id := v_task.outbound_order_id;
        v_box_inv_type := COALESCE(v_task.box_inv_type, 'PIECE');

        IF v_box_inv_type = 'BULK' THEN
            SELECT * INTO v_inv_source_bulk FROM bulk_inventory WHERE box_id = v_task.box_id AND product_id = v_task.product_id FOR UPDATE;
            IF v_inv_source_bulk IS NULL OR v_inv_source_bulk.quantity < v_task.quantity THEN
                RAISE EXCEPTION 'Thùng % (Sỉ) không đủ hàng. Cần %, Có %', v_task.box_id, v_task.quantity, COALESCE(v_inv_source_bulk.quantity, 0);
            END IF;
            UPDATE bulk_inventory SET quantity = quantity - v_task.quantity, allocated_quantity = GREATEST(0, COALESCE(allocated_quantity, 0) - v_task.quantity) WHERE id = v_inv_source_bulk.id;
        ELSE
            SELECT * INTO v_inv_source_standard FROM inventory_items WHERE box_id = v_task.box_id AND product_id = v_task.product_id ORDER BY quantity DESC LIMIT 1 FOR UPDATE;
            IF v_inv_source_standard IS NULL OR v_inv_source_standard.quantity < v_task.quantity THEN
                RAISE EXCEPTION 'Thùng % (Lẻ) không đủ hàng. Cần %, Có %', v_task.box_id, v_task.quantity, COALESCE(v_inv_source_standard.quantity, 0);
            END IF;
            UPDATE inventory_items SET quantity = quantity - v_task.quantity, allocated_quantity = GREATEST(0, COALESCE(allocated_quantity, 0) - v_task.quantity) WHERE id = v_inv_source_standard.id;
            DELETE FROM inventory_items WHERE id = v_inv_source_standard.id AND quantity <= 0 AND allocated_quantity <= 0;
        END IF;

        SELECT * INTO v_inv_dest FROM inventory_items WHERE box_id = p_outbox_id AND product_id = v_task.product_id FOR UPDATE;
        IF v_inv_dest IS NOT NULL THEN
            UPDATE inventory_items SET quantity = quantity + v_task.quantity WHERE id = v_inv_dest.id;
        ELSE
            INSERT INTO inventory_items (box_id, product_id, quantity) VALUES (p_outbox_id, v_task.product_id, v_task.quantity);
        END IF;

        UPDATE picking_tasks SET status = 'COMPLETED', outbox_id = p_outbox_id, outbox_code = v_outbox_code, picked_at = NOW(), picked_by = p_user_id WHERE id = v_task_id;
        IF v_task.order_item_id IS NOT NULL THEN
            UPDATE outbound_order_items SET picked_quantity = COALESCE(picked_quantity, 0) + v_task.quantity WHERE id = v_task.order_item_id;
        END IF;
        
        INSERT INTO transactions (type, entity_type, sku, quantity, from_box_id, to_box_id, user_id, reference_id, created_at)
        VALUES ('PICKING', 'ITEM', (SELECT sku FROM products WHERE id = v_task.product_id), v_task.quantity, v_task.box_id, p_outbox_id, p_user_id, v_outbound_order_id, NOW());
        v_success_count := v_success_count + 1;
    END LOOP;

    IF v_outbound_order_id IS NOT NULL AND v_success_count > 0 THEN
        UPDATE boxes SET outbound_order_id = v_outbound_order_id WHERE id = p_outbox_id;
        UPDATE outbound_orders SET status = 'PICKING' WHERE id = v_outbound_order_id AND status IN ('APPROVED', 'ALLOCATED', 'READY');
    END IF;
    RETURN jsonb_build_object('success', true, 'processed', v_success_count);
EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;
