
-- Migration: Enhanced Allocation with Bulk Strategy and Cross-Docking Support
-- Description:
-- 1. Adds logic specifically for BULK orders to prioritize lower-shelf, higher-sequence boxes.
-- 2. Supports Cross-Docking for Retail orders (Taking from BULK storage if needed).

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
        
        FOR v_inv IN
            SELECT 
                ii.id, 
                ii.box_id, 
                ii.quantity, 
                ii.allocated_quantity, 
                b.code as box_code,
                l.level_order
            FROM inventory_items ii
            JOIN boxes b ON ii.box_id = b.id
            LEFT JOIN locations l ON b.location_id = l.id
            WHERE ii.product_id = v_item.product_id
              AND ii.quantity > COALESCE(ii.allocated_quantity, 0)
              -- Visibility Check
              AND (b.status = 'OPEN' OR (b.status = 'LOCKED' AND b.outbound_order_id = p_order_id))
              AND (v_item.from_box_id IS NULL OR ii.box_id = v_item.from_box_id)
              -- INVENTORY TYPE MATCHING LOGIC
              AND (
                  -- Case A: Bulk Order -> Must take from Bulk Boxes
                  (v_order.inventory_type = 'BULK' AND b.inventory_type = 'BULK')
                  OR
                  -- Case B: Retail Order (PIECE) -> Prefer Retail Boxes, but fall back to Bulk allowed IF user wants (Current logic stricter)
                  -- Update: User request "chức năng phân bổ cho đơn lẻ sản phẩm, lấy hàng từ kho sỉ"
                  -- So for Retail Order, we allow BOTH Retail and Bulk boxes?
                  -- Or rather, we keep strict unless explicitly coded.
                  -- Current Code: Strict Match or Cross Dock?
                  -- "Tôi đang đề cập tới chức năng phân bổ cho đơn lẻ sản phẩm, lấy hàng từ kho sỉ nhé" -> Implying Retail orders should be able to take from Bulk inventory.
                  (v_order.inventory_type = 'PIECE' AND (b.inventory_type = 'PIECE' OR b.inventory_type IS NULL OR b.inventory_type = 'BULK'))
              )
            ORDER BY 
                -- PRIORITIZATION STRATEGY
                CASE 
                    WHEN v_order.inventory_type = 'BULK' THEN
                        -- Bulk Strategy: Priority to Floor 1 (Low level_order?) and High ID/Sequence?
                        -- User said: "Ưu tiên các thùng ở tầng 1 và có số thứ tự lớn hơn"
                        -- Assuming 'level_order' 1 is Floor 1.
                        -- And 'box_code' desc or 'id' desc for "số thứ tự lớn hơn"
                        CASE WHEN l.level_order = 1 THEN 0 ELSE 1 END
                    ELSE
                        -- Retail Strategy: Default FIFO or Box Type Clean
                        CASE WHEN b.type = 'STORAGE' THEN 0 ELSE 1 END
                END ASC,
                -- Secondary Sort for Bulk: "Số thứ tự lớn hơn" -> Newer boxes first?
                CASE 
                    WHEN v_order.inventory_type = 'BULK' THEN b.code 
                END DESC,
                -- Fallback Sort
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
                VALUES ('RESERVE', 'ITEM', v_item.sku, v_take, p_order_id, v_inv.box_id, auth.uid(), 'Phân bổ ' || v_order.code, NOW());
                
                v_remaining := v_remaining - v_take;
            END IF;
        END LOOP;
        
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
