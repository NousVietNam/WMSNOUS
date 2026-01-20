
-- Function to handle Batch Picking Confirmation efficiently
CREATE OR REPLACE FUNCTION confirm_picking_batch(
    p_task_ids UUID[],
    p_outbox_id UUID,
    p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER -- Runs with privileges of creator
AS $$
DECLARE
    v_task_id UUID;
    v_outbox_code TEXT;
    v_task RECORD;
    v_inv RECORD;
    v_existing_out_item_id UUID;
    v_base_qty INT;
    v_take_qty INT;
    v_remaining_qty INT;
    v_success_count INT := 0;
    v_errors TEXT[] := ARRAY[]::TEXT[];
    v_log_entries JSONB[] := ARRAY[]::JSONB[];
BEGIN
    -- 1. Validate Outbox
    SELECT code INTO v_outbox_code FROM boxes WHERE id = p_outbox_id AND type = 'OUTBOX';
    IF v_outbox_code IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Outbox không hợp lệ');
    END IF;

    -- 2. Loop through Tasks
    FOREACH v_task_id IN ARRAY p_task_ids
    LOOP
        -- Lock Task & Get Info
        SELECT * INTO v_task FROM picking_tasks 
        WHERE id = v_task_id FOR UPDATE SKIP LOCKED;

        IF v_task IS NULL THEN
            -- Task might be completed already or not found
            CONTINUE;
        END IF;

        IF v_task.status = 'COMPLETED' THEN
            v_success_count := v_success_count + 1;
            CONTINUE;
        END IF;

        v_remaining_qty := v_task.quantity;

        -- 3. Inventory Allocation Logic
        -- Find available stock (prioritizing same box if specified)
        FOR v_inv IN 
            SELECT * FROM inventory_items 
            WHERE product_id = v_task.product_id 
              AND quantity > 0
              AND (v_task.box_id IS NULL OR box_id = v_task.box_id) -- Prefer assigned box
            ORDER BY quantity DESC 
            FOR UPDATE -- Lock inventory rows
        LOOP
            IF v_remaining_qty <= 0 THEN EXIT; END IF;

            v_take_qty := LEAST(v_inv.quantity, v_remaining_qty);
            
            -- Deduct Source
            IF v_inv.quantity - v_take_qty = 0 THEN
                DELETE FROM inventory_items WHERE id = v_inv.id;
            ELSE
                UPDATE inventory_items 
                SET quantity = quantity - v_take_qty,
                    allocated_quantity = GREATEST(0, COALESCE(allocated_quantity, 0) - v_take_qty)
                WHERE id = v_inv.id;
            END IF;

            -- Add to Outbox
            SELECT id INTO v_existing_out_item_id 
            FROM inventory_items 
            WHERE box_id = p_outbox_id AND product_id = v_task.product_id;

            IF v_existing_out_item_id IS NOT NULL THEN
                UPDATE inventory_items 
                SET quantity = quantity + v_take_qty 
                WHERE id = v_existing_out_item_id;
            ELSE
                INSERT INTO inventory_items (box_id, product_id, quantity, expiry_date)
                VALUES (p_outbox_id, v_task.product_id, v_take_qty, NOW());
            END IF;

            -- Log Transaction entry (deferred insert)
            v_log_entries := array_append(v_log_entries, jsonb_build_object(
                'type', 'MOVE_BOX',
                'entity_type', 'ITEM',
                'sku', (SELECT sku FROM products WHERE id = v_task.product_id), -- simplified lookup
                'quantity', v_take_qty,
                'from_box_id', v_task.box_id,
                'to_box_id', p_outbox_id,
                'user_id', p_user_id,
                'created_at', NOW()
            ));

            v_remaining_qty := v_remaining_qty - v_take_qty;
        END LOOP;

        IF v_remaining_qty > 0 THEN
             v_errors := array_append(v_errors, 'Thiếu tồn kho cho Task ' || v_task_id);
             -- Rollback for this task? 
             -- For simplicity in batch, we fail this task but continue others? 
             -- Or just fail. Let's mark it 'PENDING' still.
        ELSE
            -- 4. Mark Completed
            UPDATE picking_tasks 
            SET status = 'COMPLETED', outbox_code = v_outbox_code 
            WHERE id = v_task_id;

            -- 5. Update Order Item
            UPDATE order_items AS oi
            SET picked_quantity = COALESCE(picked_quantity, 0) + v_task.quantity
            FROM picking_jobs pj
            WHERE pj.id = v_task.job_id 
              AND oi.order_id = pj.order_id 
              AND oi.product_id = v_task.product_id;

            v_success_count := v_success_count + 1;
        END IF;

    END LOOP;

    -- 6. Batch Insert Logs
    IF array_length(v_log_entries, 1) > 0 THEN
        INSERT INTO transactions (type, entity_type, sku, quantity, from_box_id, to_box_id, user_id, created_at)
        SELECT 
            (e->>'type')::text, 
            (e->>'entity_type')::text, 
            (e->>'sku')::text, 
            (e->>'quantity')::int, 
            (e->>'from_box_id')::uuid, 
            (e->>'to_box_id')::uuid, 
            (e->>'user_id')::uuid, 
            (e->>'created_at')::timestamptz
        FROM unnest(v_log_entries) AS e;
    END IF;

    RETURN jsonb_build_object(
        'success', TRUE,
        'processed', v_success_count,
        'errors', v_errors
    );
END;
$$;
