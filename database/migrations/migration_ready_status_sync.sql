-- 1. Update Outbound Orders Status Constraint
ALTER TABLE outbound_orders DROP CONSTRAINT IF EXISTS outbound_orders_status_check;
ALTER TABLE outbound_orders ADD CONSTRAINT outbound_orders_status_check 
    CHECK (status IN ('PENDING', 'APPROVED', 'ALLOCATED', 'READY', 'PICKING', 'PACKED', 'SHIPPED', 'COMPLETED', 'CANCELLED'));

-- 2. Update Create Picking Job RPC to use READY status
CREATE OR REPLACE FUNCTION create_picking_job_for_outbound(p_order_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_job_id UUID;
    v_status TEXT;
BEGIN
    -- 1. Check Order Status
    SELECT status INTO v_status FROM outbound_orders WHERE id = p_order_id;
    IF v_status != 'ALLOCATED' AND v_status != 'IDLE' THEN 
         -- proceed or warning
    END IF;

    -- 2. Try to find existing PLANNED job
    SELECT id INTO v_job_id FROM picking_jobs 
    WHERE outbound_order_id = p_order_id AND status = 'PLANNED'
    LIMIT 1;
    
    IF v_job_id IS NOT NULL THEN
        -- Activate the job
        UPDATE picking_jobs SET status = 'OPEN', started_at = NOW() WHERE id = v_job_id;
        -- NEW: Update order status to READY
        UPDATE outbound_orders SET status = 'READY', updated_at = NOW() WHERE id = p_order_id;
        
        RETURN jsonb_build_object('success', true, 'job_id', v_job_id, 'message', 'Đã tạo Job và chuyển đơn sang READY');
    END IF;

    -- 3. Check if already OPEN
    SELECT id INTO v_job_id FROM picking_jobs 
    WHERE outbound_order_id = p_order_id AND status NOT IN ('CANCELLED', 'PLANNED')
    LIMIT 1;

    IF v_job_id IS NOT NULL THEN
         RETURN jsonb_build_object('success', true, 'message', 'Job đã tồn tại', 'job_id', v_job_id);
    END IF;

    RETURN jsonb_build_object('success', false, 'error', 'Không tìm thấy job dự kiến (PLANNED). Vui lòng thử Phân bổ lại.');
END;
$$;

-- 3. Create Start Picking Job RPC for Mobile
CREATE OR REPLACE FUNCTION start_picking_job(
    p_job_id UUID,
    p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_order_id UUID;
BEGIN
    -- Get linked order
    SELECT outbound_order_id INTO v_order_id FROM picking_jobs WHERE id = p_job_id;
    
    -- Update Job
    UPDATE picking_jobs 
    SET status = 'IN_PROGRESS', 
        assigned_to = p_user_id,
        started_at = COALESCE(started_at, NOW())
    WHERE id = p_job_id;

    -- Update Order
    IF v_order_id IS NOT NULL THEN
        UPDATE outbound_orders 
        SET status = 'PICKING',
            updated_at = NOW()
        WHERE id = v_order_id;
    END IF;

    RETURN jsonb_build_object('success', true);
END;
$$;

-- 4. Update Confirm Picking RPCs to handle READY status fallback
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

        IF v_task IS NULL OR v_task.status = 'PICKED' THEN CONTINUE; END IF;
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

        UPDATE picking_tasks SET status = 'PICKED', outbox_id = p_outbox_id, picked_at = NOW(), picked_by = p_user_id WHERE id = v_task_id;
        UPDATE outbound_order_items SET picked_quantity = COALESCE(picked_quantity, 0) + v_task.quantity WHERE id = v_task.order_item_id;
        
        INSERT INTO transactions (type, entity_type, sku, quantity, from_box_id, to_box_id, user_id, reference_id, created_at)
        VALUES ('MOVE', 'ITEM', (SELECT sku FROM products WHERE id = v_task.product_id), v_task.quantity, v_task.box_id, p_outbox_id, p_user_id, v_outbound_order_id, NOW());
        v_success_count := v_success_count + 1;
    END LOOP;

    IF v_outbound_order_id IS NOT NULL THEN
        -- NEW: Update Order Status to PICKING if it was ALLOCATED or READY
        UPDATE outbound_orders SET status = 'PICKING' WHERE id = v_outbound_order_id AND status IN ('ALLOCATED', 'READY');
        UPDATE boxes SET outbound_order_id = v_outbound_order_id WHERE id = p_outbox_id;
    END IF;

    RETURN jsonb_build_object('success', true, 'processed', v_success_count);
END;
$$;

-- Likewise for confirm_box_pick
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
    SELECT outbound_order_id INTO v_outbound_order_id FROM picking_jobs WHERE id = p_job_id;

    FOR v_task IN SELECT * FROM picking_tasks WHERE job_id = p_job_id AND box_id = p_box_id AND status = 'PENDING' LOOP
        UPDATE picking_tasks SET status = 'PICKED', picked_at = NOW(), picked_by = p_user_id WHERE id = v_task.id;
        UPDATE outbound_order_items SET picked_quantity = COALESCE(picked_quantity, 0) + v_task.quantity WHERE id = v_task.order_item_id;
        v_success_count := v_success_count + 1;
    END LOOP;

    IF v_outbound_order_id IS NOT NULL THEN
        UPDATE outbound_orders SET status = 'PICKING' WHERE id = v_outbound_order_id AND status IN ('ALLOCATED', 'READY');
    END IF;

    RETURN jsonb_build_object('success', true, 'processed', v_success_count);
END;
$$;
