-- =====================================================
-- Migration: Picking System V2
-- Description: Updated picking RPCs for unified outbound schema
--              Supports Movebox logic (Storage -> Outbox)
-- =====================================================

-- 1. Schema Updates
ALTER TABLE boxes ADD COLUMN IF NOT EXISTS outbound_order_id UUID REFERENCES outbound_orders(id);
ALTER TABLE picking_tasks ADD COLUMN IF NOT EXISTS outbox_id UUID REFERENCES boxes(id);

-- 2. New Picking Batch RPC
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
    -- Validate Outbox
    SELECT code INTO v_outbox_code FROM boxes WHERE id = p_outbox_id AND type = 'OUTBOX';
    IF v_outbox_code IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Outbox không hợp lệ');
    END IF;

    -- Loop through Tasks
    FOREACH v_task_id IN ARRAY p_task_ids
    LOOP
        -- Lock Task
        SELECT pt.*, pj.outbound_order_id INTO v_task 
        FROM picking_tasks pt
        JOIN picking_jobs pj ON pt.job_id = pj.id
        WHERE pt.id = v_task_id FOR UPDATE;

        IF v_task IS NULL OR v_task.status = 'PICKED' THEN
            CONTINUE;
        END IF;

        v_outbound_order_id := v_task.outbound_order_id;

        -- 1. Move Inventory from Storage Box to Outbox
        -- Find specific allocated item in source box
        SELECT * INTO v_inv_source 
        FROM inventory_items 
        WHERE box_id = v_task.box_id 
          AND product_id = v_task.product_id
          AND allocated_quantity >= v_task.quantity
        LIMIT 1 FOR UPDATE;

        IF v_inv_source IS NULL THEN
             -- Fallback: any item in that box?
             SELECT * INTO v_inv_source FROM inventory_items WHERE box_id = v_task.box_id AND product_id = v_task.product_id LIMIT 1 FOR UPDATE;
        END IF;

        IF v_inv_source IS NOT NULL THEN
            -- Deduct from Source
            UPDATE inventory_items 
            SET quantity = quantity - v_task.quantity,
                allocated_quantity = GREATEST(0, COALESCE(allocated_quantity, 0) - v_task.quantity)
            WHERE id = v_inv_source.id;

            -- Increase/Create in Dest (Outbox)
            SELECT * INTO v_inv_dest FROM inventory_items WHERE box_id = p_outbox_id AND product_id = v_task.product_id FOR UPDATE;
            
            IF v_inv_dest IS NOT NULL THEN
                UPDATE inventory_items 
                SET quantity = quantity + v_task.quantity,
                    allocated_quantity = COALESCE(allocated_quantity, 0) + v_task.quantity
                WHERE id = v_inv_dest.id;
            ELSE
                INSERT INTO inventory_items (box_id, product_id, quantity, allocated_quantity)
                VALUES (p_outbox_id, v_task.product_id, v_task.quantity, v_task.quantity);
            END IF;

            -- Cleanup source if empty
            DELETE FROM inventory_items WHERE id = v_inv_source.id AND quantity <= 0 AND allocated_quantity <= 0;
        END IF;

        -- 2. Mark Task as PICKED
        UPDATE picking_tasks 
        SET status = 'PICKED', 
            outbox_id = p_outbox_id,
            picked_at = NOW(),
            picked_by = p_user_id
        WHERE id = v_task_id;

        -- 3. Update Order Item Progress
        UPDATE outbound_order_items 
        SET picked_quantity = COALESCE(picked_quantity, 0) + v_task.quantity
        WHERE id = v_task.order_item_id;

        -- 4. Log Transaction (MOVE_PICK)
        INSERT INTO transactions (type, entity_type, sku, quantity, from_box_id, to_box_id, user_id, reference_id, created_at)
        VALUES (
            'MOVE', 'ITEM', 
            (SELECT sku FROM products WHERE id = v_task.product_id), 
            v_task.quantity, 
            v_task.box_id, p_outbox_id, 
            p_user_id, v_outbound_order_id, 
            NOW()
        );

        v_success_count := v_success_count + 1;
    END LOOP;

    -- Update Order Status to PICKING if it was ALLOCATED
    IF v_outbound_order_id IS NOT NULL THEN
        UPDATE outbound_orders 
        SET status = 'PICKING' 
        WHERE id = v_outbound_order_id AND status = 'ALLOCATED';
        
        -- Link Outbox to Order
        UPDATE boxes SET outbound_order_id = v_outbound_order_id WHERE id = p_outbox_id;
    END IF;

    RETURN jsonb_build_object('success', true, 'processed', v_success_count);
END;
$$;

-- 3. New Box Pick RPC
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

    -- Update all tasks for this box in this job
    FOR v_task IN 
        SELECT * FROM picking_tasks 
        WHERE job_id = p_job_id AND box_id = p_box_id AND status = 'PENDING'
    LOOP
        -- Mark Task
        UPDATE picking_tasks 
        SET status = 'PICKED', 
            picked_at = NOW(),
            picked_by = p_user_id
        WHERE id = v_task.id;

        -- Update Order Item
        UPDATE outbound_order_items 
        SET picked_quantity = COALESCE(picked_quantity, 0) + v_task.quantity
        WHERE id = v_task.order_item_id;

        v_success_count := v_success_count + 1;
    END LOOP;

    -- Update Order Status
    IF v_outbound_order_id IS NOT NULL THEN
        UPDATE outbound_orders 
        SET status = 'PICKING' 
        WHERE id = v_outbound_order_id AND status = 'ALLOCATED';
    END IF;

    -- Note: We don't move the inventory records because the box is bê-nguyên-đi.
    -- We just mark box as picking? 
    -- Actually, we could move box location to 'PACKING' if needed.

    RETURN jsonb_build_object('success', true, 'processed', v_success_count);
END;
$$;

-- 4. Movebox-aware Ship Outbound RPC
CREATE OR REPLACE FUNCTION ship_outbound(p_order_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_order RECORD;
    v_task RECORD;
    v_pxk_code TEXT;
    v_shipment_id UUID;
    v_dest_name TEXT;
    v_item_count INT;
    v_inv_target RECORD;
    v_target_box_id UUID;
BEGIN
    -- 1. Get Order
    SELECT * INTO v_order FROM outbound_orders WHERE id = p_order_id FOR UPDATE;
    IF v_order IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Không tìm thấy đơn hàng');
    END IF;
    
    -- Allow shipping from Allocated (Skipped Pick), Picking, or Packed
    IF v_order.status NOT IN ('ALLOCATED', 'PICKING', 'PACKED') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Đơn hàng chưa sẵn sàng xuất (Status: ' || v_order.status || ')');
    END IF;

    -- 2. Generate PXK & Shipment Header
    v_pxk_code := 'PXK-' || to_char(NOW(), 'YYMMDD') || '-' || substring(p_order_id::text from 1 for 4);
    
    IF v_order.type = 'SALE' THEN
        SELECT name INTO v_dest_name FROM customers WHERE id = v_order.customer_id;
    ELSE
        SELECT name INTO v_dest_name FROM destinations WHERE id = v_order.destination_id;
    END IF;

    INSERT INTO outbound_shipments (
        code, source_type, source_id, created_by, customer_name, metadata
    )
    VALUES (
        v_pxk_code, v_order.type, p_order_id, auth.uid(), 
        COALESCE(v_dest_name, 'N/A'),
        jsonb_build_object('total', v_order.total)
    )
    RETURNING id INTO v_shipment_id;

    -- 3. Process Inventory Based on Tasks
    FOR v_task IN 
        SELECT pt.box_id, pt.product_id, pt.quantity, pt.outbox_id, p.sku
        FROM picking_tasks pt
        JOIN picking_jobs pj ON pt.job_id = pj.id
        JOIN products p ON pt.product_id = p.id
        WHERE pj.outbound_order_id = p_order_id
          AND pt.status IN ('PENDING', 'PICKED')
    LOOP
        -- Determine target box (Outbox if picked, else Source Box)
        v_target_box_id := COALESCE(v_task.outbox_id, v_task.box_id);

        -- Find and Lock inventory item
        SELECT * INTO v_inv_target 
        FROM inventory_items 
        WHERE box_id = v_target_box_id AND product_id = v_task.product_id 
        FOR UPDATE;

        IF v_inv_target IS NOT NULL THEN
            -- A. Deduct Inventory
            UPDATE inventory_items
            SET quantity = quantity - v_task.quantity,
                allocated_quantity = GREATEST(0, COALESCE(allocated_quantity, 0) - v_task.quantity)
            WHERE id = v_inv_target.id;

            -- B. Cleanup Empty Inventory
            DELETE FROM inventory_items 
            WHERE id = v_inv_target.id AND quantity <= 0 AND allocated_quantity <= 0;
            
            -- C. Create Transaction (SHIP)
            INSERT INTO transactions (type, entity_type, sku, quantity, reference_id, from_box_id, user_id, note, created_at)
            VALUES (
                CASE WHEN v_order.type = 'SALE' THEN 'SHIP' ELSE 'TRANSFER_OUT' END,
                'ITEM',
                v_task.sku,
                -v_task.quantity,
                v_shipment_id,
                v_target_box_id,
                auth.uid(),
                'Xuất kho đơn ' || v_order.code || ' (' || v_pxk_code || ')',
                NOW()
            );
        END IF;
    END LOOP;

    -- 4. Finalize Order & Jobs
    UPDATE outbound_orders SET status = 'SHIPPED', shipped_at = NOW() WHERE id = p_order_id;
    UPDATE picking_jobs SET status = 'COMPLETED' WHERE outbound_order_id = p_order_id;
    UPDATE picking_tasks SET status = 'PICKED' WHERE status = 'PENDING' AND job_id IN (SELECT id FROM picking_jobs WHERE outbound_order_id = p_order_id);
    
    -- 5. Mark Boxes as SHIPPED if they are fully linked to this order
    -- (Mainly for Box Picking or if Box is single-order box)
    UPDATE boxes SET status = 'SHIPPED' WHERE outbound_order_id = p_order_id;

    RETURN jsonb_build_object('success', true, 'code', v_pxk_code);
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;
