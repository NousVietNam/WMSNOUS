
-- Unified Picking RPC to handle both PIECE and BULK inventory
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
    v_inventory_type TEXT;
BEGIN
    -- 1. Validate Outbox
    SELECT code INTO v_outbox_code FROM boxes WHERE id = p_outbox_id AND type IN ('OUTBOX', 'CART');
    IF v_outbox_code IS NULL THEN 
        RETURN jsonb_build_object('success', false, 'error', 'Outbox không hợp lệ hoặc không phải loại OUTBOX/CART'); 
    END IF;

    -- 2. Process each task
    FOREACH v_task_id IN ARRAY p_task_ids LOOP
        -- Join with order/wave to get inventory_type
        SELECT pt.*, pj.outbound_order_id, COALESCE(pw.inventory_type, oo.inventory_type, 'PIECE') as inv_type
        FROM picking_tasks pt 
        JOIN picking_jobs pj ON pt.job_id = pj.id
        LEFT JOIN outbound_orders oo ON pj.outbound_order_id = oo.id
        LEFT JOIN pick_waves pw ON pj.wave_id = pw.id
        WHERE pt.id = v_task_id
        INTO v_task;

        -- Skip if task already done or not found
        IF v_task IS NULL OR v_task.status = 'COMPLETED' THEN CONTINUE; END IF;
        
        v_outbound_order_id := v_task.outbound_order_id;
        v_inventory_type := v_task.inv_type;

        -- 3. Inventory movements
        IF v_inventory_type = 'BULK' THEN
            -- Source: bulk_inventory
            SELECT * INTO v_inv_source FROM bulk_inventory 
            WHERE box_id = v_task.box_id AND product_id = v_task.product_id 
            FOR UPDATE;
            
            IF v_inv_source IS NOT NULL THEN
                -- Deduct from Bulk
                UPDATE bulk_inventory 
                SET quantity = quantity - v_task.quantity, 
                    allocated_quantity = GREATEST(0, COALESCE(allocated_quantity, 0) - v_task.quantity) 
                WHERE id = v_inv_source.id;
                
                -- Add to Piece Inventory (Outbox is always piece-based conceptually)
                SELECT * INTO v_inv_dest FROM inventory_items 
                WHERE box_id = p_outbox_id AND product_id = v_task.product_id 
                FOR UPDATE;
                
                IF v_inv_dest IS NOT NULL THEN
                    UPDATE inventory_items 
                    SET quantity = quantity + v_task.quantity, 
                        allocated_quantity = COALESCE(allocated_quantity, 0) + v_task.quantity 
                    WHERE id = v_inv_dest.id;
                ELSE
                    INSERT INTO inventory_items (box_id, product_id, quantity, allocated_quantity, warehouse_id) 
                    VALUES (p_outbox_id, v_task.product_id, v_task.quantity, v_task.quantity, v_inv_source.warehouse_id);
                END IF;
                
                -- Cleanup source if empty
                DELETE FROM bulk_inventory WHERE id = v_inv_source.id AND quantity <= 0 AND allocated_quantity <= 0;
            END IF;
        ELSE
            -- Source: inventory_items (Standard PIECE)
            SELECT * INTO v_inv_source FROM inventory_items 
            WHERE box_id = v_task.box_id AND product_id = v_task.product_id 
            FOR UPDATE;

            IF v_inv_source IS NOT NULL THEN
                UPDATE inventory_items 
                SET quantity = quantity - v_task.quantity, 
                    allocated_quantity = GREATEST(0, COALESCE(allocated_quantity, 0) - v_task.quantity) 
                WHERE id = v_inv_source.id;
                
                SELECT * INTO v_inv_dest FROM inventory_items 
                WHERE box_id = p_outbox_id AND product_id = v_task.product_id 
                FOR UPDATE;
                
                IF v_inv_dest IS NOT NULL THEN
                    UPDATE inventory_items 
                    SET quantity = quantity + v_task.quantity, 
                        allocated_quantity = COALESCE(allocated_quantity, 0) + v_task.quantity 
                    WHERE id = v_inv_dest.id;
                ELSE
                    INSERT INTO inventory_items (box_id, product_id, quantity, allocated_quantity, warehouse_id) 
                    VALUES (p_outbox_id, v_task.product_id, v_task.quantity, v_task.quantity, v_inv_source.warehouse_id);
                END IF;
                
                DELETE FROM inventory_items WHERE id = v_inv_source.id AND quantity <= 0 AND allocated_quantity <= 0;
            END IF;
        END IF;

        -- 4. Set task to COMPLETED
        UPDATE picking_tasks 
        SET status = 'COMPLETED', 
            outbox_id = p_outbox_id, 
            picked_at = NOW(), 
            picked_by = p_user_id 
        WHERE id = v_task_id;
        
        -- 5. Mark Job as started
        UPDATE picking_jobs SET started_at = NOW() WHERE id = v_task.job_id AND started_at IS NULL;

        -- 6. Update Order Items (Polymorphic support)
        UPDATE outbound_order_items SET picked_quantity = COALESCE(picked_quantity, 0) + v_task.quantity WHERE id = v_task.order_item_id;
        UPDATE order_items SET picked_quantity = COALESCE(picked_quantity, 0) + v_task.quantity WHERE id = v_task.order_item_id;
        UPDATE transfer_order_items SET picked_quantity = COALESCE(picked_quantity, 0) + v_task.quantity WHERE id = v_task.order_item_id;
        
        -- 7. Log Transaction
        INSERT INTO transactions (type, entity_type, sku, quantity, from_box_id, to_box_id, user_id, reference_id, created_at)
        VALUES ('MOVE', 'ITEM', (SELECT sku FROM products WHERE id = v_task.product_id), v_task.quantity, v_task.box_id, p_outbox_id, p_user_id, v_outbound_order_id, NOW());
        
        v_success_count := v_success_count + 1;
    END LOOP;

    -- 8. Final touches: Update order status to PICKING
    IF v_outbound_order_id IS NOT NULL THEN
        UPDATE outbound_orders SET status = 'PICKING' WHERE id = v_outbound_order_id AND status IN ('ALLOCATED', 'READY');
        UPDATE boxes SET outbound_order_id = v_outbound_order_id WHERE id = p_outbox_id;
    END IF;

    RETURN jsonb_build_object('success', true, 'processed', v_success_count);
END;
$$;
