
-- Migration: Add support for allocating from bulk_inventory for BULK orders
-- This fixes the issue where Stock is in bulk_inventory but Allocation only looks at inventory_items.

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
        
        -- Logic Split: BULK vs PIECE
        IF v_order.inventory_type = 'BULK' THEN
            -- ========================================================
            -- STRATEGY A: ALLOCATE FROM BULK_INVENTORY
            -- ========================================================
            FOR v_inv IN
                SELECT bi.id, bi.box_id, bi.quantity, bi.allocated_quantity, b.code as box_code
                FROM bulk_inventory bi
                JOIN boxes b ON bi.box_id = b.id
                LEFT JOIN locations l ON b.location_id = l.id
                WHERE bi.product_id = v_item.product_id
                  AND bi.quantity > COALESCE(bi.allocated_quantity, 0)
                  -- Allow OPEN or Locked by this order
                  AND (b.status = 'OPEN' OR (b.status = 'LOCKED' AND b.outbound_order_id = p_order_id))
                  -- Enforce Inventory Type
                  AND b.inventory_type = 'BULK'
                ORDER BY 
                    -- Priority to Floor 1 (level_order=1), then others
                    CASE WHEN COALESCE(l.level_order, 999) = 1 THEN 0 ELSE 1 END,
                    b.code DESC 
                FOR UPDATE OF bi
            LOOP
                IF v_remaining <= 0 THEN EXIT; END IF;
                
                v_take := LEAST(v_inv.quantity - COALESCE(v_inv.allocated_quantity, 0), v_remaining);
                
                IF v_take > 0 THEN
                    INSERT INTO picking_tasks (job_id, order_item_id, product_id, box_id, quantity, status, created_at)
                    VALUES (v_job_id, v_item.id, v_item.product_id, v_inv.box_id, v_take, 'PENDING', NOW());
                    
                    UPDATE bulk_inventory
                    SET allocated_quantity = COALESCE(allocated_quantity, 0) + v_take
                    WHERE id = v_inv.id;
                    
                    INSERT INTO transactions (type, entity_type, sku, quantity, reference_id, from_box_id, user_id, note, created_at)
                    VALUES ('RESERVE', 'ITEM', v_item.sku, v_take, p_order_id, v_inv.box_id, auth.uid(), 'Phân bổ Sỉ cho đơn ' || v_order.code, NOW());
                    
                    v_remaining := v_remaining - v_take;
                END IF;
            END LOOP;

        ELSE
            -- ========================================================
            -- STRATEGY B: ALLOCATE FROM INVENTORY_ITEMS (PIECE/RETAIL)
            -- ========================================================
            FOR v_inv IN
                SELECT ii.id, ii.box_id, ii.quantity, ii.allocated_quantity, b.code as box_code
                FROM inventory_items ii
                JOIN boxes b ON ii.box_id = b.id
                WHERE ii.product_id = v_item.product_id
                  AND ii.quantity > COALESCE(ii.allocated_quantity, 0)
                  AND (b.status = 'OPEN' OR (b.status = 'LOCKED' AND b.outbound_order_id = p_order_id))
                  AND (v_item.from_box_id IS NULL OR ii.box_id = v_item.from_box_id)
                  AND (b.inventory_type = 'PIECE' OR b.inventory_type IS NULL)
                ORDER BY 
                    CASE WHEN b.type = 'STORAGE' THEN 0 ELSE 1 END,
                    ii.created_at ASC 
                FOR UPDATE OF ii
            LOOP
                IF v_remaining <= 0 THEN EXIT; END IF;
                
                v_take := LEAST(v_inv.quantity - COALESCE(v_inv.allocated_quantity, 0), v_remaining);
                
                IF v_take > 0 THEN
                    INSERT INTO picking_tasks (job_id, order_item_id, product_id, box_id, quantity, status, created_at)
                    VALUES (v_job_id, v_item.id, v_item.product_id, v_inv.box_id, v_take, 'PENDING', NOW());
                    
                    UPDATE inventory_items
                    SET allocated_quantity = COALESCE(allocated_quantity, 0) + v_take
                    WHERE id = v_inv.id;
                    
                    INSERT INTO transactions (type, entity_type, sku, quantity, reference_id, from_box_id, user_id, note, created_at)
                    VALUES ('RESERVE', 'ITEM', v_item.sku, v_take, p_order_id, v_inv.box_id, auth.uid(), 'Phân bổ Lẻ cho đơn ' || v_order.code, NOW());
                    
                    v_remaining := v_remaining - v_take;
                END IF;
            END LOOP;
        END IF;

        IF v_remaining > 0 THEN
            v_errors := array_append(v_errors, 'Thiếu ' || v_remaining || ' ' || v_item.sku);
        END IF;
    END LOOP;

    IF array_length(v_errors, 1) > 0 THEN
        RAISE EXCEPTION 'Không đủ hàng phân bổ: %', v_errors;
    END IF;

    UPDATE outbound_orders SET status = 'ALLOCATED', allocated_at = NOW() WHERE id = p_order_id;
    RETURN jsonb_build_object('success', true, 'job_id', v_job_id);
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;
