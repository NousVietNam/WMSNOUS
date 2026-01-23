-- ========================================================
-- Migration: Fix ship_outbound_order RPC & Picking Logic
-- Description: Ensures all inventory in linked boxes is deducted
--              and transactions are logged correctly.
-- ========================================================

-- 1. Ensure boxes table has outbound_order_id
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'boxes' AND column_name = 'outbound_order_id') THEN
        ALTER TABLE boxes ADD COLUMN outbound_order_id UUID REFERENCES outbound_orders(id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'outbound_orders' AND column_name = 'shipped_at') THEN
        ALTER TABLE outbound_orders ADD COLUMN shipped_at TIMESTAMPTZ;
    END IF;
END $$;

-- 2. Update confirm_picking_batch (ITEM PICK)
-- Ensures the OUTBOX is linked to the order
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

        IF v_inv_source IS NOT NULL THEN
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
        END IF;

        -- D. Update Task Status
        UPDATE picking_tasks 
        SET status = 'COMPLETED', outbox_id = p_outbox_id, picked_at = NOW(), picked_by = p_user_id 
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
END;
$$;

-- 3. Update confirm_box_pick (BOX PICK)
-- Ensures the Source Box is linked to the order
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
    v_success_count INT := 0;
BEGIN
    SELECT * INTO v_job FROM picking_jobs WHERE id = p_job_id;
    IF v_job IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Không tìm thấy Job'); END IF;

    -- Link Box to Order
    UPDATE boxes SET outbound_order_id = v_job.outbound_order_id, updated_at = NOW() WHERE id = p_box_id;

    FOR v_task IN 
        SELECT id, quantity, order_item_id FROM picking_tasks 
        WHERE job_id = p_job_id AND box_id = p_box_id AND status != 'COMPLETED'
    LOOP
        UPDATE picking_tasks SET status = 'COMPLETED', picked_at = NOW(), picked_by = p_user_id WHERE id = v_task.id;
        UPDATE outbound_order_items SET picked_quantity = COALESCE(picked_quantity, 0) + v_task.quantity WHERE id = v_task.order_item_id;
        v_success_count := v_success_count + 1;
    END LOOP;

    IF v_job.outbound_order_id IS NOT NULL THEN
        UPDATE outbound_orders SET status = 'PICKING', updated_at = NOW() WHERE id = v_job.outbound_order_id AND status IN ('PENDING', 'APPROVED', 'ALLOCATED', 'READY');
    END IF;

    RETURN jsonb_build_object('success', true, 'processed', v_success_count);
END;
$$;

-- 4. Unified ship_outbound_order
-- Processes all items in boxes linked to the order
CREATE OR REPLACE FUNCTION ship_outbound_order(p_order_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_order RECORD;
    v_box_ids UUID[];
    v_pxk_code TEXT;
    v_shipment_id UUID;
    v_user_id UUID;
    v_item RECORD;
    v_dest_name TEXT;
BEGIN
    v_user_id := auth.uid();

    -- 1. Get Outbound Order
    SELECT * INTO v_order FROM outbound_orders WHERE id = p_order_id FOR UPDATE;
    IF v_order IS NULL THEN 
        RETURN jsonb_build_object('success', false, 'error', 'Không tìm thấy đơn hàng/phiếu xuất'); 
    END IF;
    
    IF v_order.status = 'SHIPPED' THEN 
        RETURN jsonb_build_object('success', false, 'error', 'Đơn hàng này đã được xuất kho trước đó'); 
    END IF;

    -- 2. Generate PXK Code
    v_pxk_code := 'PXK-' || to_char(NOW(), 'YYMMDD') || '-' || substring(p_order_id::text from 1 for 4);

    -- 3. Get Customer/Destination Name
    IF v_order.type = 'SALE' OR v_order.type = 'GIFT' THEN
        SELECT name INTO v_dest_name FROM customers WHERE id = v_order.customer_id;
    ELSE
        SELECT name INTO v_dest_name FROM destinations WHERE id = v_order.destination_id;
    END IF;

    -- 4. Create Outbound Shipment Record
    INSERT INTO outbound_shipments (code, source_type, source_id, created_by, outbound_order_id, customer_name, metadata)
    VALUES (
        v_pxk_code, v_order.type, p_order_id, v_user_id, p_order_id, 
        COALESCE(v_dest_name, 'N/A'),
        jsonb_build_object('original_code', v_order.code, 'type', v_order.type, 'total', v_order.total)
    )
    RETURNING id INTO v_shipment_id;

    -- 5. Process all inventory items in boxes linked to this order
    -- This handles both Item-Pick (Outbox) and Box-Pick (Source Box)
    FOR v_item IN 
        SELECT i.id as inv_item_id, i.box_id, i.product_id, i.quantity, p.sku
        FROM boxes b
        JOIN inventory_items i ON i.box_id = b.id
        JOIN products p ON i.product_id = p.id
        WHERE b.outbound_order_id = p_order_id
    LOOP
        -- A. Create Transaction Entry
        INSERT INTO transactions (type, entity_type, sku, quantity, reference_id, from_box_id, user_id, note, created_at)
        VALUES (
            CASE WHEN v_order.type = 'SALE' THEN 'SHIP' ELSE 'TRANSFER_OUT' END,
            'ITEM', v_item.sku, -v_item.quantity, v_shipment_id, v_item.box_id, v_user_id,
            'Xuất kho ' || v_pxk_code || ' (Đơn: ' || v_order.code || ')',
            NOW()
        );

        -- B. Deduct Stock and Allocated Quantity
        UPDATE inventory_items 
        SET quantity = GREATEST(0, quantity - v_item.quantity),
            allocated_quantity = GREATEST(0, COALESCE(allocated_quantity, 0) - v_item.quantity)
        WHERE id = v_item.inv_item_id;
        
        -- C. Cleanup (Remove zero inventory)
        DELETE FROM inventory_items WHERE id = v_item.inv_item_id;
    END LOOP;

    -- 5. Mark Boxes as SHIPPED
    UPDATE boxes SET status = 'SHIPPED', updated_at = NOW() WHERE outbound_order_id = p_order_id;

    -- 6. Update Outbound Order
    UPDATE outbound_orders SET status = 'SHIPPED', shipped_at = NOW(), updated_at = NOW() WHERE id = p_order_id;

    -- 7. Complete related jobs
    UPDATE picking_jobs SET status = 'COMPLETED', completed_at = NOW() WHERE outbound_order_id = p_order_id AND status != 'CANCELLED';

    RETURN jsonb_build_object(
        'success', true, 
        'message', 'Xuất kho thành công: ' || v_pxk_code,
        'shipment_code', v_pxk_code
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;
