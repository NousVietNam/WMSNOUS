-- 1. Standardize existing data (Fix UI 0% progress)
UPDATE picking_tasks SET status = 'COMPLETED' WHERE status = 'PICKED';

-- 2. Standardize confirm_picking_batch (Item Pick)
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
    SELECT code INTO v_outbox_code FROM boxes WHERE id = p_outbox_id AND type = 'OUTBOX';
    IF v_outbox_code IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Outbox không hợp lệ'); END IF;

    FOREACH v_task_id IN ARRAY p_task_ids LOOP
        SELECT pt.*, pj.outbound_order_id INTO v_task 
        FROM picking_tasks pt JOIN picking_jobs pj ON pt.job_id = pj.id
        WHERE pt.id = v_task_id FOR UPDATE;

        IF v_task IS NULL OR v_task.status = 'COMPLETED' THEN CONTINUE; END IF;
        v_outbound_order_id := v_task.outbound_order_id;

        -- Inventory movements...
        SELECT * INTO v_inv_source FROM inventory_items WHERE box_id = v_task.box_id AND product_id = v_task.product_id AND allocated_quantity >= v_task.quantity LIMIT 1 FOR UPDATE;
        IF v_inv_source IS NULL THEN SELECT * INTO v_inv_source FROM inventory_items WHERE box_id = v_task.box_id AND product_id = v_task.product_id LIMIT 1 FOR UPDATE; END IF;

        IF v_inv_source IS NOT NULL THEN
            UPDATE inventory_items SET quantity = quantity - v_task.quantity, allocated_quantity = GREATEST(0, COALESCE(allocated_quantity, 0) - v_task.quantity) WHERE id = v_inv_source.id;
            SELECT * INTO v_inv_dest FROM inventory_items WHERE box_id = p_outbox_id AND product_id = v_task.product_id FOR UPDATE;
            IF v_inv_dest IS NOT NULL THEN
                UPDATE inventory_items SET quantity = quantity + v_task.quantity, allocated_quantity = COALESCE(allocated_quantity, 0) + v_task.quantity WHERE id = v_inv_dest.id;
            ELSE
                INSERT INTO inventory_items (box_id, product_id, quantity, allocated_quantity) VALUES (p_outbox_id, v_task.product_id, v_task.quantity, v_task.quantity);
            END IF;
            DELETE FROM inventory_items WHERE id = v_inv_source.id AND quantity <= 0 AND allocated_quantity <= 0;
        END IF;

        -- CRITICAL: Set to COMPLETED
        UPDATE picking_tasks SET status = 'COMPLETED', outbox_id = p_outbox_id, picked_at = NOW(), picked_by = p_user_id WHERE id = v_task_id;
        
        -- Tracking: Set job started_at on first pick
        UPDATE picking_jobs SET started_at = NOW() WHERE id = v_task.job_id AND started_at IS NULL;

        -- Polymorphic Update for Order Items
        UPDATE outbound_order_items SET picked_quantity = COALESCE(picked_quantity, 0) + v_task.quantity WHERE id = v_task.order_item_id;
        UPDATE order_items SET picked_quantity = COALESCE(picked_quantity, 0) + v_task.quantity WHERE id = v_task.order_item_id;
        UPDATE transfer_order_items SET picked_quantity = COALESCE(picked_quantity, 0) + v_task.quantity WHERE id = v_task.order_item_id;
        
        INSERT INTO transactions (type, entity_type, sku, quantity, from_box_id, to_box_id, user_id, reference_id, created_at)
        VALUES ('MOVE', 'ITEM', (SELECT sku FROM products WHERE id = v_task.product_id), v_task.quantity, v_task.box_id, p_outbox_id, p_user_id, v_outbound_order_id, NOW());
        v_success_count := v_success_count + 1;
    END LOOP;

    IF v_outbound_order_id IS NOT NULL THEN
        UPDATE outbound_orders SET status = 'PICKING' WHERE id = v_outbound_order_id AND status IN ('ALLOCATED', 'READY');
        UPDATE boxes SET outbound_order_id = v_outbound_order_id WHERE id = p_outbox_id;
    END IF;

    RETURN jsonb_build_object('success', true, 'processed', v_success_count);
END;
$$;

-- 3. Standardize confirm_box_pick (Whole Box)
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
    SELECT * INTO v_job FROM picking_jobs WHERE id = p_job_id;
    IF v_job IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Không tìm thấy Job'); END IF;

    SELECT id INTO v_gate_out_id FROM locations WHERE code = 'GATE-OUT' LIMIT 1;
    IF v_gate_out_id IS NOT NULL THEN
        UPDATE boxes SET location_id = v_gate_out_id, updated_at = NOW() WHERE id = p_box_id;
    END IF;

    FOR v_task IN 
        SELECT id, quantity, order_item_id FROM picking_tasks 
        WHERE job_id = p_job_id AND box_id = p_box_id AND status ILIKE 'PENDING' 
    LOOP
        -- CRITICAL: Set to COMPLETED
        UPDATE picking_tasks SET status = 'COMPLETED', picked_at = NOW(), picked_by = p_user_id WHERE id = v_task.id;

        -- Tracking: Set job started_at on first pick
        UPDATE picking_jobs SET started_at = NOW() WHERE id = p_job_id AND started_at IS NULL;

        UPDATE outbound_order_items SET picked_quantity = COALESCE(picked_quantity, 0) + v_task.quantity WHERE id = v_task.order_item_id;
        UPDATE order_items SET picked_quantity = COALESCE(picked_quantity, 0) + v_task.quantity WHERE id = v_task.order_item_id;
        UPDATE transfer_order_items SET picked_quantity = COALESCE(picked_quantity, 0) + v_task.quantity WHERE id = v_task.order_item_id;

        v_success_count := v_success_count + 1;
    END LOOP;

    IF v_job.outbound_order_id IS NOT NULL THEN
        UPDATE outbound_orders SET status = 'PICKING', updated_at = NOW() WHERE id = v_job.outbound_order_id AND status IN ('ALLOCATED', 'READY');
    END IF;

    RETURN jsonb_build_object('success', true, 'processed', v_success_count);
END;
$$;
