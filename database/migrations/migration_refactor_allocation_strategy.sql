-- =====================================================
-- Migration: Refactor Allocation Strategy
-- Description: 
-- Separate the logic for selecting and ranking inventory candidates into a dedicated function.
-- This allows easy upgrade of "Brain" rules without touching the main allocation transaction logic.
-- =====================================================

-- 1. Create a Helper Function for Strategy
-- Returns valid inventory items sorted by the chosen strategy
CREATE OR REPLACE FUNCTION get_picking_candidates(
    p_product_id UUID,
    p_order_id UUID,
    p_required_products UUID[], -- List of all products in order for context
    p_strategy TEXT
)
RETURNS TABLE (
    id UUID,
    box_id UUID,
    quantity INT,
    allocated_quantity INT,
    box_code TEXT,
    match_score BIGINT,
    box_type TEXT,
    created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE -- Can be optimized by PG
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ii.id, 
        ii.box_id, 
        ii.quantity, 
        ii.allocated_quantity, 
        b.code as box_code,
        -- Strategy Metric Calculation
        (
            SELECT COUNT(DISTINCT ii2.product_id)
            FROM inventory_items ii2
            WHERE ii2.box_id = ii.box_id 
              AND ii2.product_id = ANY(p_required_products)
        ) as match_score,
        b.type as box_type,
        ii.created_at
    FROM inventory_items ii
    JOIN boxes b ON ii.box_id = b.id
    WHERE ii.product_id = p_product_id
      AND ii.quantity > COALESCE(ii.allocated_quantity, 0)
      -- Strict Visibility Check
      AND (
          b.status = 'OPEN' 
          OR 
          (b.status = 'LOCKED' AND b.outbound_order_id = p_order_id)
      )
    ORDER BY 
        -- 1. Strategy: MATCH_ORDER_CONTENT
        CASE WHEN p_strategy = 'MATCH_ORDER_CONTENT' THEN 
            (SELECT COUNT(DISTINCT ii2.product_id)
               FROM inventory_items ii2
               WHERE ii2.box_id = ii.box_id 
                 AND ii2.product_id = ANY(p_required_products))
        ELSE 0 END DESC,

        -- 2. Box Type Preference (Prioritize Non-Storage for picking if strategy allows)
        CASE WHEN b.type = 'STORAGE' THEN 1 ELSE 0 END,
        
        -- 3. Default FIFO
        ii.created_at ASC;
END;
$$;

-- 2. Update Allocate Function to use the Helper
CREATE OR REPLACE FUNCTION allocate_outbound(p_order_id UUID, p_strategy TEXT DEFAULT 'FIFO')
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
    v_required_products UUID[];
BEGIN
    -- 1. Get Order
    SELECT * INTO v_order FROM outbound_orders WHERE id = p_order_id FOR UPDATE;
    IF v_order IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Không tìm thấy đơn hàng');
    END IF;
    
    IF v_order.status != 'APPROVED' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Đơn hàng phải ở trạng thái APPROVED mới được Phân Bổ');
    END IF;

    -- Get list of all required products for Strategy Context
    SELECT array_agg(product_id) INTO v_required_products 
    FROM outbound_order_items 
    WHERE order_id = p_order_id;

    -- 2. Create PLANNED Job
    INSERT INTO picking_jobs (outbound_order_id, type, status, created_at)
    VALUES (p_order_id, 
            CASE WHEN v_order.type IN ('TRANSFER', 'INTERNAL') AND v_order.transfer_type = 'BOX' THEN 'BOX_PICK' ELSE 'ITEM_PICK' END,
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
        
        -- FIND INVENTORY using Helper Strategy Function
        -- Note: Explicit Box Request bypasses strategy
        IF v_item.from_box_id IS NOT NULL THEN
             FOR v_inv IN
                SELECT ii.*, b.code as box_code
                FROM inventory_items ii
                JOIN boxes b ON ii.box_id = b.id
                WHERE ii.product_id = v_item.product_id
                  AND ii.box_id = v_item.from_box_id
                  AND ii.quantity > COALESCE(ii.allocated_quantity, 0)
                  -- Simplified check for direct box request (assumes validity or adds error if not found)
                FOR UPDATE OF ii
             LOOP
                IF v_remaining <= 0 THEN EXIT; END IF;
                v_take := LEAST(v_inv.quantity - COALESCE(v_inv.allocated_quantity, 0), v_remaining);
                IF v_take > 0 THEN
                    INSERT INTO picking_tasks (job_id, order_item_id, product_id, box_id, quantity, status, created_at)
                    VALUES (v_job_id, v_item.id, v_item.product_id, v_inv.box_id, v_take, 'PENDING', NOW());
                    UPDATE inventory_items SET allocated_quantity = COALESCE(allocated_quantity, 0) + v_take WHERE id = v_inv.id;
                    INSERT INTO transactions (type, entity_type, sku, quantity, reference_id, from_box_id, user_id, note, created_at)
                    VALUES ('RESERVE', 'ITEM', v_item.sku, v_take, p_order_id, v_inv.box_id, auth.uid(), 'Phân bổ (Chỉ định thùng) ' || v_order.code, NOW());
                    v_remaining := v_remaining - v_take;
                END IF;
             END LOOP;
        ELSE
             -- Use Strategy for General Allocation
             FOR v_inv IN
                SELECT * FROM get_picking_candidates(v_item.product_id, p_order_id, v_required_products, p_strategy)
                -- We must lock the rows. Since func returns a table, we need to join or select again?
                -- PL/PGSQL cursor loop over function result doesn't lock rows automatically.
                -- Better approach: Select IDs from strategy, then Select FOR UPDATE.
             LOOP
                -- Re-fetch and Lock specific row
                DECLARE
                    v_locked_inv inventory_items%ROWTYPE;
                BEGIN
                    SELECT * INTO v_locked_inv 
                    FROM inventory_items 
                    WHERE id = v_inv.id 
                    FOR UPDATE SKIP LOCKED; -- Skip if someone else locked it? Or default wait? Default wait is safer.
                    
                    IF FOUND AND v_remaining > 0 THEN
                         v_take := LEAST(v_locked_inv.quantity - COALESCE(v_locked_inv.allocated_quantity, 0), v_remaining);
                         IF v_take > 0 THEN
                            INSERT INTO picking_tasks (job_id, order_item_id, product_id, box_id, quantity, status, created_at)
                            VALUES (v_job_id, v_item.id, v_item.product_id, v_locked_inv.box_id, v_take, 'PENDING', NOW());
                            
                            UPDATE inventory_items 
                            SET allocated_quantity = COALESCE(allocated_quantity, 0) + v_take
                            WHERE id = v_locked_inv.id;
                            
                            INSERT INTO transactions (type, entity_type, sku, quantity, reference_id, from_box_id, user_id, note, created_at)
                            VALUES ('RESERVE', 'ITEM', v_item.sku, v_take, p_order_id, v_locked_inv.box_id, auth.uid(), 'Phân bổ ' || v_order.code, NOW());
                            
                            v_remaining := v_remaining - v_take;
                         END IF;
                    END IF;
                END;
                IF v_remaining <= 0 THEN EXIT; END IF;
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
