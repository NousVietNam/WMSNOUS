-- Migration: Robust Allocation for Bulk & Piece Inventory
-- Description: Updates allocate_outbound to look into both inventory_items and bulk_inventory.

CREATE OR REPLACE FUNCTION allocate_outbound(p_order_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_order RECORD;
    v_item RECORD;
    v_inv RECORD;
    v_remaining INT;
    v_take INT;
    v_job_id UUID;
    v_errors TEXT[] := ARRAY[]::TEXT[];
BEGIN
    -- 1. Get Order
    SELECT * INTO v_order FROM outbound_orders WHERE id = p_order_id FOR UPDATE;
    IF v_order IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Không tìm thấy đơn hàng');
    END IF;
    
    IF v_order.is_approved IS NOT TRUE THEN
        RETURN jsonb_build_object('success', false, 'error', 'Đơn hàng chưa được Duyệt (Approved)');
    END IF;
    
    IF v_order.status IN ('ALLOCATED', 'PICKING', 'PACKED', 'SHIPPED', 'COMPLETED') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Đơn hàng đã được phân bổ hoặc đang xử lý');
    END IF;

    -- 2. Create PLANNED Job
    INSERT INTO picking_jobs (outbound_order_id, type, status, created_at)
    VALUES (p_order_id, 
            CASE WHEN v_order.transfer_type = 'BOX' THEN 'BOX_PICK' ELSE 'ITEM_PICK' END,
            'PLANNED', 
            NOW())
    RETURNING id INTO v_job_id;

    -- 3. Loop through items
    FOR v_item IN 
        SELECT ooi.*, p.sku 
        FROM outbound_order_items ooi
        JOIN products p ON ooi.product_id = p.id
        WHERE ooi.order_id = p_order_id
        ORDER BY ooi.id
    LOOP
        v_remaining := v_item.quantity;
        
        -- Combined selection from both PIECE and BULK tables
        FOR v_inv IN
            WITH combined_inv AS (
                -- Standard Inventory
                SELECT 
                    ii.id as source_id, 
                    ii.box_id, 
                    ii.quantity, 
                    ii.allocated_quantity, 
                    b.code as box_code,
                    'PIECE' as inv_type,
                    b.type as box_type,
                    ii.created_at
                FROM inventory_items ii
                JOIN boxes b ON ii.box_id = b.id
                WHERE ii.product_id = v_item.product_id
                
                UNION ALL
                
                -- Bulk Inventory
                SELECT 
                    bi.id as source_id, 
                    bi.box_id, 
                    bi.quantity, 
                    bi.allocated_quantity, 
                    b.code as box_code,
                    'BULK' as inv_type,
                    b.type as box_type,
                    bi.created_at
                FROM bulk_inventory bi
                JOIN boxes b ON bi.box_id = b.id
                WHERE bi.product_id = v_item.product_id
            )
            SELECT * FROM combined_inv ci
            WHERE ci.quantity > COALESCE(ci.allocated_quantity, 0)
              -- Respect pre-assigned box if any
              AND (v_item.from_box_id IS NULL OR ci.box_id = v_item.from_box_id)
              -- Lock boxes logic (already handled by previous migrations)
              AND EXISTS (
                  SELECT 1 FROM boxes b 
                  WHERE b.id = ci.box_id 
                    AND (b.status = 'OPEN' OR (b.status = 'LOCKED' AND b.outbound_order_id = p_order_id))
              )
            ORDER BY 
                -- Strategy: favor pre-assigned, then storage, then oldest stock
                CASE WHEN ci.box_id = v_item.from_box_id THEN 0 ELSE 1 END,
                CASE WHEN ci.box_type = 'STORAGE' THEN 0 ELSE 1 END,
                ci.created_at ASC 
        LOOP
            IF v_remaining <= 0 THEN EXIT; END IF;
            
            v_take := LEAST(v_inv.quantity - COALESCE(v_inv.allocated_quantity, 0), v_remaining);
            
            IF v_take > 0 THEN
                -- Create Task
                INSERT INTO picking_tasks (job_id, order_item_id, product_id, box_id, quantity, status, created_at)
                VALUES (v_job_id, v_item.id, v_item.product_id, v_inv.box_id, v_take, 'PENDING', NOW());
                
                -- Update Allocation (Polymorphic)
                IF v_inv.inv_type = 'BULK' THEN
                    UPDATE bulk_inventory
                    SET allocated_quantity = COALESCE(allocated_quantity, 0) + v_take
                    WHERE id = v_inv.source_id;
                ELSE
                    UPDATE inventory_items
                    SET allocated_quantity = COALESCE(allocated_quantity, 0) + v_take
                    WHERE id = v_inv.source_id;
                END IF;
                
                -- Log Transaction
                INSERT INTO transactions (type, entity_type, sku, quantity, reference_id, from_box_id, user_id, note, created_at)
                VALUES ('RESERVE', 'ITEM', v_item.sku, v_take, p_order_id, v_inv.box_id, auth.uid(), 
                        'Phân bổ (' || v_inv.inv_type || ') cho đơn ' || v_order.code, NOW());
                
                v_remaining := v_remaining - v_take;
            END IF;
        END LOOP;
        
        IF v_remaining > 0 THEN
            v_errors := array_append(v_errors, 'Thiếu ' || v_remaining || ' ' || v_item.sku);
        END IF;
    END LOOP;

    -- Rollback if not enough stock
    IF array_length(v_errors, 1) > 0 THEN
        RAISE EXCEPTION 'Không đủ hàng phân bổ: %', array_to_string(v_errors, ', ');
    END IF;

    -- Mark Order as ALLOCATED
    UPDATE outbound_orders SET status = 'ALLOCATED', allocated_at = NOW() WHERE id = p_order_id;
    
    -- Lock Boxes
    UPDATE boxes
    SET status = 'LOCKED',
        outbound_order_id = p_order_id,
        updated_at = NOW()
    WHERE id IN (SELECT DISTINCT box_id FROM picking_tasks WHERE job_id = v_job_id);

    RETURN jsonb_build_object('success', true, 'job_id', v_job_id);
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;
