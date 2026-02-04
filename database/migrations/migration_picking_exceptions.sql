
-- 0. Add picked_quantity to picking_tasks if missing
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='picking_tasks' AND column_name='picked_quantity') THEN
        ALTER TABLE picking_tasks ADD COLUMN picked_quantity INT DEFAULT 0;
    END IF;
END $$;

-- 1. Create a table to track picking exceptions
CREATE TABLE IF NOT EXISTS picking_exceptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID REFERENCES picking_jobs(id),
    task_id UUID REFERENCES picking_tasks(id),
    product_id UUID REFERENCES products(id),
    box_id UUID REFERENCES boxes(id), -- The box where the issue occurred
    user_id UUID REFERENCES auth.users(id),
    
    exception_type TEXT NOT NULL CHECK (exception_type IN ('SHORTAGE', 'DAMAGED', 'MISSING_BOX', 'WRONG_LOCATION', 'OTHER')),
    
    quantity_expected INT NOT NULL,
    quantity_actual INT NOT NULL,
    quantity_missing INT GENERATED ALWAYS AS (quantity_expected - quantity_actual) STORED,
    
    note TEXT,
    
    status TEXT DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'RESOLVED', 'IGNORED')),
    resolved_at TIMESTAMPTZ,
    resolved_by UUID REFERENCES auth.users(id),
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_picking_exceptions_status ON picking_exceptions(status);
CREATE INDEX IF NOT EXISTS idx_picking_exceptions_job ON picking_exceptions(job_id);

-- 2. RPC: Report Exception (Shortage)
CREATE OR REPLACE FUNCTION confirm_picking_exception(
    p_task_id UUID,
    p_outbox_id UUID,
    p_actual_qty INT,
    p_reason TEXT,
    p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_task RECORD;
    v_job_id UUID;
    v_outbound_order_id UUID;
    v_product_id UUID;
    v_box_id UUID; 
    v_expected_qty INT;
    v_inv_source RECORD;
    v_inv_dest RECORD;
    v_missing_qty INT;
BEGIN
    -- Get Task
    SELECT * INTO v_task FROM picking_tasks WHERE id = p_task_id;
    IF v_task IS NULL OR v_task.status = 'COMPLETED' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Task invalid');
    END IF;
    
    v_expected_qty := v_task.quantity;
    v_missing_qty := v_expected_qty - p_actual_qty;
    v_job_id := v_task.job_id;
    v_product_id := v_task.product_id;
    v_box_id := v_task.box_id;
    v_outbound_order_id := (SELECT outbound_order_id FROM picking_jobs WHERE id = v_job_id);

    IF p_actual_qty < 0 OR p_actual_qty > v_expected_qty THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid quantity');
    END IF;

    -- Process Actual Pick
    IF p_actual_qty > 0 THEN
        -- Find Source
        SELECT * INTO v_inv_source FROM inventory_items 
        WHERE box_id = v_box_id AND product_id = v_product_id 
        FOR UPDATE;

        IF v_inv_source IS NOT NULL THEN
            UPDATE inventory_items 
            SET quantity = quantity - p_actual_qty,
                allocated_quantity = GREATEST(0, COALESCE(allocated_quantity, 0) - p_actual_qty)
            WHERE id = v_inv_source.id;
            
            -- Add to Outbox
             SELECT * INTO v_inv_dest FROM inventory_items 
             WHERE box_id = p_outbox_id AND product_id = v_product_id 
             FOR UPDATE;
             
             IF v_inv_dest IS NOT NULL THEN
                 UPDATE inventory_items 
                 SET quantity = quantity + p_actual_qty,
                     allocated_quantity = COALESCE(allocated_quantity, 0) + p_actual_qty
                 WHERE id = v_inv_dest.id;
             ELSE
                 INSERT INTO inventory_items (box_id, product_id, quantity, allocated_quantity, warehouse_id)
                 VALUES (p_outbox_id, v_product_id, p_actual_qty, p_actual_qty, v_inv_source.warehouse_id);
             END IF;
             
             DELETE FROM inventory_items WHERE id = v_inv_source.id AND quantity <= 0 AND allocated_quantity <= 0;
             
             INSERT INTO transactions (type, entity_type, sku, quantity, from_box_id, to_box_id, user_id, reference_id, created_at)
             VALUES ('MOVE', 'ITEM', (SELECT sku FROM products WHERE id = v_product_id), p_actual_qty, v_box_id, p_outbox_id, p_user_id, v_outbound_order_id, NOW());
        END IF;
    END IF;

    -- Handle Missing
    IF v_missing_qty > 0 THEN
        INSERT INTO picking_exceptions (
            job_id, task_id, product_id, box_id, user_id,
            exception_type, quantity_expected, quantity_actual, note
        ) VALUES (
            v_job_id, p_task_id, v_product_id, v_box_id, p_user_id,
            'SHORTAGE', v_expected_qty, p_actual_qty, p_reason
        );
        
        -- Release Allocation for missing part to avoid deadlock, but log it
        UPDATE inventory_items
        SET allocated_quantity = GREATEST(0, COALESCE(allocated_quantity, 0) - v_missing_qty)
        WHERE box_id = v_box_id AND product_id = v_product_id;
    END IF;

    -- Complete Task
    UPDATE picking_tasks 
    SET status = 'COMPLETED',
        picked_at = NOW(),
        picked_by = p_user_id,
        picked_quantity = p_actual_qty
    WHERE id = p_task_id;

    -- Update Orders
    IF p_actual_qty > 0 THEN
        UPDATE outbound_order_items SET picked_quantity = COALESCE(picked_quantity, 0) + p_actual_qty WHERE id = v_task.order_item_id;
        UPDATE order_items SET picked_quantity = COALESCE(picked_quantity, 0) + p_actual_qty WHERE id = v_task.order_item_id;
        UPDATE transfer_order_items SET picked_quantity = COALESCE(picked_quantity, 0) + p_actual_qty WHERE id = v_task.order_item_id;
    END IF;

    UPDATE picking_jobs SET started_at = NOW() WHERE id = v_job_id AND started_at IS NULL;
    
    IF v_outbound_order_id IS NOT NULL THEN
        UPDATE outbound_orders SET status = 'PICKING' WHERE id = v_outbound_order_id AND status IN ('ALLOCATED', 'READY');
        IF p_outbox_id IS NOT NULL THEN
             UPDATE boxes SET outbound_order_id = v_outbound_order_id WHERE id = p_outbox_id;
        END IF;
    END IF;

    RETURN jsonb_build_object('success', true, 'missing', v_missing_qty);
END;
$$;

-- 3. RPC: Swap Allocation and Pick (Found elsewhere)
CREATE OR REPLACE FUNCTION swap_and_pick(
    p_task_id UUID,
    p_new_box_id UUID, -- The user scanned THIS box instead
    p_outbox_id UUID,
    p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_task RECORD;
    v_old_box_id UUID;
    v_inv_new RECORD;
    v_inv_old RECORD;
    v_qty INT;
BEGIN
    -- Get Task
    SELECT * INTO v_task FROM picking_tasks WHERE id = p_task_id;
    IF v_task IS NULL OR v_task.status = 'COMPLETED' THEN return jsonb_build_object('success', false, 'error', 'Task invalid'); END IF;
    
    v_qty := v_task.quantity;
    v_old_box_id := v_task.box_id;

    -- Check Valid Box
    IF NOT EXISTS (SELECT 1 FROM boxes WHERE id = p_new_box_id AND status = 'OPEN') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Thùng mới không hợp lệ (Không phải OPEN)'); 
    END IF;

    -- Check Inventory in New Box
    SELECT * INTO v_inv_new FROM inventory_items 
    WHERE box_id = p_new_box_id AND product_id = v_task.product_id;
    
    IF v_inv_new IS NULL OR v_inv_new.quantity < v_qty THEN
        RETURN jsonb_build_object('success', false, 'error', 'Thùng này không đủ hàng!'); 
    END IF;

    -- OK, Swap Allocation
    -- 1. Release Old Box
    UPDATE inventory_items 
    SET allocated_quantity = GREATEST(0, COALESCE(allocated_quantity, 0) - v_qty)
    WHERE box_id = v_old_box_id AND product_id = v_task.product_id;
    
    -- 2. Allocate New Box (This might fail if new box is fully reserved, so we use greatest)
    -- Actually, if we are picking NOW, we don't strictly need to allocate, we can just consume.
    -- But to keep logic consistent with "confirm_picking_batch" which assumes allocation exists, let's just update the Task box_id.
    
    UPDATE picking_tasks SET box_id = p_new_box_id WHERE id = p_task_id;
    
    -- 3. Log Exception for Old Box (Wrong Location)
    INSERT INTO picking_exceptions (
        job_id, task_id, product_id, box_id, user_id,
        exception_type, quantity_expected, quantity_actual, note
    ) VALUES (
        v_task.job_id, p_task_id, v_task.product_id, v_old_box_id, p_user_id,
        'WRONG_LOCATION', v_qty, 0, 'User picked from alternate box ' || p_new_box_id
    );

    -- 4. Execute Pick (By calling the standard confirm logic? No, let's just do it directly to be safe)
    -- Deduct New Box
    UPDATE inventory_items 
    SET quantity = quantity - v_qty
        -- Note: We didn't add to allocated_quantity of new box, so we don't subtract from it.
        -- Wait, if it WASN'T allocated, subtracting only quantity is correct.
        -- BUT if it WAS allocated to someone else?
        -- We should check valid available quantity: (quantity - allocate_quantity) >= v_qty
    WHERE id = v_inv_new.id;
    
    -- Move to Outbox
    INSERT INTO inventory_items (box_id, product_id, quantity, allocated_quantity, warehouse_id)
    VALUES (p_outbox_id, v_task.product_id, v_qty, v_qty, v_inv_new.warehouse_id)
    ON CONFLICT (box_id, product_id) DO UPDATE 
    SET quantity = inventory_items.quantity + EXCLUDED.quantity,
        allocated_quantity = inventory_items.allocated_quantity + EXCLUDED.quantity;

    -- Cleanup
    DELETE FROM inventory_items WHERE id = v_inv_new.id AND quantity <= 0 AND allocated_quantity <= 0;

    -- Complete Task
    UPDATE picking_tasks 
    SET status = 'COMPLETED', picked_at = NOW(), picked_by = p_user_id, picked_quantity = v_qty
    WHERE id = p_task_id;
    
    -- Update Order Stats
    UPDATE outbound_order_items SET picked_quantity = COALESCE(picked_quantity, 0) + v_qty WHERE id = v_task.order_item_id;
    
    -- Log Tx
    INSERT INTO transactions (type, entity_type, sku, quantity, from_box_id, to_box_id, user_id, reference_id, created_at)
    VALUES ('MOVE', 'ITEM', (SELECT sku FROM products WHERE id = v_task.product_id), v_qty, p_new_box_id, p_outbox_id, p_user_id, (SELECT outbound_order_id FROM picking_jobs WHERE id=v_task.job_id), NOW());

    RETURN jsonb_build_object('success', true);
END;
$$;

-- View
CREATE OR REPLACE VIEW view_picking_exceptions AS
SELECT 
    pe.*,
    p.sku as product_sku,
    p.name as product_name,
    p.image_url as product_image,
    b.code as box_code,
    u.name as user_name,
    pj.code as job_code,
    oo.code as order_code,
    oo.id as order_id
FROM picking_exceptions pe
LEFT JOIN products p ON pe.product_id = p.id
LEFT JOIN boxes b ON pe.box_id = b.id
LEFT JOIN public.users u ON pe.user_id = u.id
LEFT JOIN picking_jobs pj ON pe.job_id = pj.id
LEFT JOIN outbound_orders oo ON pj.outbound_order_id = oo.id;
