-- Migration: Master Picking RPC Fix
-- Description: 
-- 1. Support for both PIECE and BULK inventory in all Picking RPCs.
-- 2. Fixed references to "outbound_order_items" (removing non-existent order_items/transfer_order_items).
-- 3. Consolidated logic for batch, box, exception, and swap picks.

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
        SELECT pt.*, pj.outbound_order_id, b.inventory_type as box_inv_type 
        INTO v_task FROM picking_tasks pt 
        JOIN picking_jobs pj ON pt.job_id = pj.id
        LEFT JOIN boxes b ON pt.box_id = b.id
        WHERE pt.id = v_task_id FOR UPDATE;

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


-- B. FIX confirm_box_pick
CREATE OR REPLACE FUNCTION confirm_box_pick(p_box_id UUID, p_job_id UUID, p_user_id UUID DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_task RECORD;
    v_job RECORD;
    v_gate_out_id UUID;
    v_success_count INT := 0;
BEGIN
    SELECT * INTO v_job FROM picking_jobs WHERE id = p_job_id;
    IF v_job IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Không tìm thấy Job'); END IF;
    SELECT id INTO v_gate_out_id FROM locations WHERE code = 'GATE-OUT' LIMIT 1;
    IF v_gate_out_id IS NOT NULL THEN UPDATE boxes SET location_id = v_gate_out_id, updated_at = NOW() WHERE id = p_box_id; END IF;

    FOR v_task IN SELECT id, quantity, order_item_id FROM picking_tasks WHERE job_id = p_job_id AND box_id = p_box_id AND status ILIKE 'PENDING' LOOP
        UPDATE picking_tasks SET status = 'COMPLETED', picked_at = NOW(), picked_by = p_user_id WHERE id = v_task.id;
        IF v_task.order_item_id IS NOT NULL THEN
            UPDATE outbound_order_items SET picked_quantity = COALESCE(picked_quantity, 0) + v_task.quantity WHERE id = v_task.order_item_id;
        END IF;
        v_success_count := v_success_count + 1;
    END LOOP;

    IF v_job.outbound_order_id IS NOT NULL THEN
        UPDATE outbound_orders SET status = 'PICKING', updated_at = NOW() WHERE id = v_job.outbound_order_id AND status IN ('APPROVED', 'ALLOCATED', 'READY');
    END IF;
    RETURN jsonb_build_object('success', true, 'processed', v_success_count);
END;
$$;


-- C. FIX confirm_picking_exception
CREATE OR REPLACE FUNCTION confirm_picking_exception(
    p_task_id UUID,
    p_outbox_id UUID,
    p_actual_qty INT,
    p_reason TEXT,
    p_user_id UUID
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_task RECORD;
    v_job_id UUID;
    v_outbound_order_id UUID;
    v_missing_qty INT;
    v_inv_source_bulk RECORD;
    v_inv_source_standard RECORD;
    v_box_inv_type TEXT;
BEGIN
    SELECT pt.*, b.inventory_type as box_inv_type INTO v_task FROM picking_tasks pt LEFT JOIN boxes b ON pt.box_id = b.id WHERE pt.id = p_task_id;
    IF v_task IS NULL OR v_task.status = 'COMPLETED' THEN RETURN jsonb_build_object('success', false, 'error', 'Task invalid'); END IF;
    
    v_job_id := v_task.job_id;
    v_missing_qty := v_task.quantity - p_actual_qty;
    v_outbound_order_id := (SELECT outbound_order_id FROM picking_jobs WHERE id = v_job_id);
    v_box_inv_type := COALESCE(v_task.box_inv_type, 'PIECE');

    IF p_actual_qty > 0 THEN
        IF v_box_inv_type = 'BULK' THEN
            UPDATE bulk_inventory SET quantity = quantity - p_actual_qty, allocated_quantity = GREATEST(0, COALESCE(allocated_quantity, 0) - p_actual_qty) WHERE box_id = v_task.box_id AND product_id = v_task.product_id;
        ELSE
            UPDATE inventory_items SET quantity = quantity - p_actual_qty, allocated_quantity = GREATEST(0, COALESCE(allocated_quantity, 0) - p_actual_qty) WHERE box_id = v_task.box_id AND product_id = v_task.product_id;
            DELETE FROM inventory_items WHERE box_id = v_task.box_id AND product_id = v_task.product_id AND quantity <= 0 AND allocated_quantity <= 0;
        END IF;

        INSERT INTO inventory_items (box_id, product_id, quantity) VALUES (p_outbox_id, v_task.product_id, p_actual_qty)
        ON CONFLICT (box_id, product_id) DO UPDATE SET quantity = inventory_items.quantity + EXCLUDED.quantity;
        
        INSERT INTO transactions (type, entity_type, sku, quantity, from_box_id, to_box_id, user_id, reference_id, created_at)
        VALUES ('PICK_EXCEPTION', 'ITEM', (SELECT sku FROM products WHERE id = v_task.product_id), p_actual_qty, v_task.box_id, p_outbox_id, p_user_id, v_outbound_order_id, NOW());
    END IF;

    IF v_missing_qty > 0 THEN
        INSERT INTO picking_exceptions (job_id, task_id, product_id, box_id, user_id, exception_type, quantity_expected, quantity_actual, note)
        VALUES (v_job_id, p_task_id, v_task.product_id, v_task.box_id, p_user_id, 'SHORTAGE', v_task.quantity, p_actual_qty, p_reason);
        
        IF v_box_inv_type = 'BULK' THEN
            UPDATE bulk_inventory SET allocated_quantity = GREATEST(0, COALESCE(allocated_quantity, 0) - v_missing_qty) WHERE box_id = v_task.box_id AND product_id = v_task.product_id;
        ELSE
            UPDATE inventory_items SET allocated_quantity = GREATEST(0, COALESCE(allocated_quantity, 0) - v_missing_qty) WHERE box_id = v_task.box_id AND product_id = v_task.product_id;
        END IF;
    END IF;

    UPDATE picking_tasks SET status = 'COMPLETED', picked_at = NOW(), picked_by = p_user_id, picked_quantity = p_actual_qty WHERE id = p_task_id;
    IF p_actual_qty > 0 AND v_task.order_item_id IS NOT NULL THEN
        UPDATE outbound_order_items SET picked_quantity = COALESCE(picked_quantity, 0) + p_actual_qty WHERE id = v_task.order_item_id;
    END IF;

    UPDATE outbound_orders SET status = 'PICKING' WHERE id = v_outbound_order_id AND status IN ('APPROVED', 'ALLOCATED', 'READY');
    RETURN jsonb_build_object('success', true);
END;
$$;


-- D. FIX swap_and_pick
CREATE OR REPLACE FUNCTION swap_and_pick(
    p_task_id UUID,
    p_new_box_id UUID,
    p_outbox_id UUID,
    p_user_id UUID
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_task RECORD;
    v_qty INT;
    v_new_box_inv_type TEXT;
    v_inv_new RECORD;
BEGIN
    SELECT pt.*, b.inventory_type as box_inv_type INTO v_task FROM picking_tasks pt LEFT JOIN boxes b ON pt.box_id = b.id WHERE pt.id = p_task_id;
    IF v_task IS NULL OR v_task.status = 'COMPLETED' THEN RETURN jsonb_build_object('success', false, 'error', 'Task invalid'); END IF;
    v_qty := v_task.quantity;
    
    SELECT inventory_type INTO v_new_box_inv_type FROM boxes WHERE id = p_new_box_id;

    IF v_new_box_inv_type = 'BULK' THEN
        SELECT * INTO v_inv_new FROM bulk_inventory WHERE box_id = p_new_box_id AND product_id = v_task.product_id;
    ELSE
        SELECT * INTO v_inv_new FROM inventory_items WHERE box_id = p_new_box_id AND product_id = v_task.product_id;
    END IF;

    IF v_inv_new IS NULL OR v_inv_new.quantity < v_qty THEN RETURN jsonb_build_object('success', false, 'error', 'Thùng mới không đủ hàng'); END IF;

    -- Release Old Box Allocation (PIECE or BULK)
    IF v_task.box_inv_type = 'BULK' THEN
        UPDATE bulk_inventory SET allocated_quantity = GREATEST(0, COALESCE(allocated_quantity, 0) - v_qty) WHERE box_id = v_task.box_id AND product_id = v_task.product_id;
    ELSE
        UPDATE inventory_items SET allocated_quantity = GREATEST(0, COALESCE(allocated_quantity, 0) - v_qty) WHERE box_id = v_task.box_id AND product_id = v_task.product_id;
    END IF;

    -- Pick from New Box
    IF v_new_box_inv_type = 'BULK' THEN
        UPDATE bulk_inventory SET quantity = quantity - v_qty WHERE id = v_inv_new.id;
    ELSE
        UPDATE inventory_items SET quantity = quantity - v_qty WHERE id = v_inv_new.id;
        DELETE FROM inventory_items WHERE id = v_inv_new.id AND quantity <= 0 AND allocated_quantity <= 0;
    END IF;

    INSERT INTO inventory_items (box_id, product_id, quantity) VALUES (p_outbox_id, v_task.product_id, v_qty)
    ON CONFLICT (box_id, product_id) DO UPDATE SET quantity = inventory_items.quantity + EXCLUDED.quantity;

    UPDATE picking_tasks SET status = 'COMPLETED', box_id = p_new_box_id, picked_at = NOW(), picked_by = p_user_id, picked_quantity = v_qty WHERE id = p_task_id;
    IF v_task.order_item_id IS NOT NULL THEN
        UPDATE outbound_order_items SET picked_quantity = COALESCE(picked_quantity, 0) + v_qty WHERE id = v_task.order_item_id;
    END IF;

    INSERT INTO transactions (type, entity_type, sku, quantity, from_box_id, to_box_id, user_id, created_at)
    VALUES ('SWAP_PICK', 'ITEM', (SELECT sku FROM products WHERE id = v_task.product_id), v_qty, p_new_box_id, p_outbox_id, p_user_id, NOW());

    RETURN jsonb_build_object('success', true);
END;
$$;
