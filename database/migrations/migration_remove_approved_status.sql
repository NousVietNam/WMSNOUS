-- =====================================================
-- Migration: Remove APPROVED status from Outbound Orders
-- Description: 
-- 1. Sets all 'APPROVED' orders to 'PENDING' + is_approved=TRUE.
-- 2. Updates the status constraint.
-- 3. Updates allocate_outbound, release_outbound, and create_picking_job RPCs.
-- =====================================================

-- 1. Cleanup existing 'APPROVED' status
UPDATE outbound_orders 
SET status = 'PENDING', is_approved = TRUE 
WHERE status = 'APPROVED';

-- 2. Update Status Constraint
ALTER TABLE outbound_orders DROP CONSTRAINT IF EXISTS outbound_orders_status_check;
ALTER TABLE outbound_orders ADD CONSTRAINT outbound_orders_status_check 
    CHECK (status IN ('PENDING', 'ALLOCATED', 'READY', 'PICKING', 'PACKED', 'SHIPPED', 'COMPLETED', 'CANCELLED'));

-- 3. Update allocate_outbound to check is_approved flag
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
    
    -- Changed: Check is_approved flag instead of status
    IF NOT v_order.is_approved THEN
        RETURN jsonb_build_object('success', false, 'error', 'Đơn hàng phải được Duyệt (is_approved) mới được Phân Bổ');
    END IF;

    -- If already allocated, return error
    IF v_order.status != 'PENDING' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Chỉ có thể phân bổ đơn đang ở trạng thái PENDING (Hiện tại: ' || v_order.status || ')');
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
        IF v_item.from_box_id IS NOT NULL THEN
             FOR v_inv IN
                SELECT ii.*, b.code as box_code
                FROM inventory_items ii
                JOIN boxes b ON ii.box_id = b.id
                WHERE ii.product_id = v_item.product_id
                  AND ii.box_id = v_item.from_box_id
                  AND ii.quantity > COALESCE(ii.allocated_quantity, 0)
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
             -- Use Strategy for General Allocation (Assuming get_picking_candidates exists)
             FOR v_inv IN
                SELECT * FROM get_picking_candidates(v_item.product_id, p_order_id, v_required_products, p_strategy)
             LOOP
                DECLARE
                    v_locked_inv inventory_items%ROWTYPE;
                BEGIN
                    SELECT * INTO v_locked_inv 
                    FROM inventory_items 
                    WHERE id = v_inv.id 
                    FOR UPDATE;
                    
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

-- 4. Update release_outbound to set status to PENDING
CREATE OR REPLACE FUNCTION release_outbound(p_order_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_order RECORD;
    v_task RECORD;
BEGIN
    SELECT * INTO v_order FROM outbound_orders WHERE id = p_order_id;
    
    IF v_order IS NULL THEN
         RETURN jsonb_build_object('success', false, 'error', 'Không tìm thấy đơn hàng');
    END IF;

    IF v_order.status NOT IN ('ALLOCATED', 'READY') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Chỉ có thể hủy phân bổ đơn đang ở trạng thái ALLOCATED/READY (Hiện tại: ' || v_order.status || ')');
    END IF;

    -- Return items to inventory
    FOR v_task IN 
        SELECT pt.*, p.sku 
        FROM picking_tasks pt
        JOIN picking_jobs pj ON pt.job_id = pj.id
        JOIN products p ON pt.product_id = p.id
        WHERE pj.outbound_order_id = p_order_id 
          AND pj.status IN ('PLANNED', 'PENDING', 'OPEN')
    LOOP
        UPDATE inventory_items
        SET allocated_quantity = GREATEST(0, COALESCE(allocated_quantity, 0) - v_task.quantity)
        WHERE box_id = v_task.box_id AND product_id = v_task.product_id;
        
        INSERT INTO transactions (type, entity_type, sku, quantity, reference_id, from_box_id, user_id, note, created_at)
        VALUES ('RELEASE', 'ITEM', v_task.sku, v_task.quantity, p_order_id, v_task.box_id, auth.uid(), 'Hủy phân bổ đơn ' || v_order.code, NOW());
    END LOOP;

    -- Cleanup Jobs/Tasks
    DELETE FROM picking_tasks WHERE job_id IN (SELECT id FROM picking_jobs WHERE outbound_order_id = p_order_id);
    DELETE FROM picking_jobs WHERE outbound_order_id = p_order_id;

    -- Update Order - Set to PENDING (since APPROVED is gone)
    UPDATE outbound_orders 
    SET status = 'PENDING', 
        allocated_at = NULL 
    WHERE id = p_order_id;

    RETURN jsonb_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- 5. Update get_inventory_summary to use is_approved flag
CREATE OR REPLACE FUNCTION get_inventory_summary(
    p_location_code TEXT DEFAULT NULL,
    p_box_code TEXT DEFAULT NULL,
    p_brand TEXT DEFAULT NULL,
    p_target_audience TEXT DEFAULT NULL,
    p_product_group TEXT DEFAULT NULL,
    p_season TEXT DEFAULT NULL,
    p_launch_month TEXT DEFAULT NULL,
    p_search TEXT DEFAULT NULL,
    p_warehouse_id UUID DEFAULT NULL
)
RETURNS TABLE (
    total_quantity BIGINT,
    total_allocated BIGINT,
    total_approved BIGINT
)
AS $$
DECLARE
    v_total_qty BIGINT;
    v_total_allocated BIGINT;
    v_total_approved_orders BIGINT;
    v_total_approved_transfers BIGINT;
BEGIN
    -- 1. Inventory Aggregates
    SELECT 
        COALESCE(SUM(i.quantity), 0),
        COALESCE(SUM(i.allocated_quantity), 0)
    INTO v_total_qty, v_total_allocated
    FROM inventory_items i
    JOIN products p ON i.product_id = p.id
    LEFT JOIN boxes b ON i.box_id = b.id
    LEFT JOIN locations l_box ON b.location_id = l_box.id
    LEFT JOIN locations l_direct ON i.location_id = l_direct.id
    WHERE 
        (p_warehouse_id IS NULL OR i.warehouse_id = p_warehouse_id) AND
        (p_brand IS NULL OR p.brand = p_brand) AND
        (p_target_audience IS NULL OR p.target_audience = p_target_audience) AND
        (p_product_group IS NULL OR p.product_group = p_product_group) AND
        (p_season IS NULL OR p.season = p_season) AND
        (p_launch_month IS NULL OR p.launch_month::text = p_launch_month) AND
        (p_location_code IS NULL OR COALESCE(l_box.code, l_direct.code) = p_location_code) AND
        (p_box_code IS NULL OR b.code = p_box_code) AND
        (p_search IS NULL OR (
            p.name ILIKE '%' || p_search || '%' OR
            p.sku ILIKE '%' || p_search || '%' OR
            (p.barcode IS NOT NULL AND p.barcode ILIKE '%' || p_search || '%')
        ));

    -- 2. Approved Aggregates (Orders) - Check is_approved flag
    SELECT COALESCE(SUM(oi.quantity), 0)
    INTO v_total_approved_orders
    FROM outbound_order_items oi
    JOIN outbound_orders o ON oi.order_id = o.id
    JOIN products p ON oi.product_id = p.id
    WHERE 
        o.is_approved = true AND 
        o.status NOT IN ('SHIPPED', 'COMPLETED', 'CANCELLED') AND
        (p_brand IS NULL OR p.brand = p_brand) AND
        (p_target_audience IS NULL OR p.target_audience = p_target_audience) AND
        (p_product_group IS NULL OR p.product_group = p_product_group) AND
        (p_season IS NULL OR p.season = p_season) AND
        (p_launch_month IS NULL OR p.launch_month::text = p_launch_month) AND
        (p_search IS NULL OR (
            p.name ILIKE '%' || p_search || '%' OR
            p.sku ILIKE '%' || p_search || '%' OR 
            (p.barcode IS NOT NULL AND p.barcode ILIKE '%' || p_search || '%')
        ));
        
    -- 3. Approved Aggregates (Transfers/Nội bộ) - Handle as part of outbound_orders
    v_total_approved_transfers := 0;

    -- Return
    total_quantity := v_total_qty;
    total_allocated := v_total_allocated;
    total_approved := v_total_approved_orders + v_total_approved_transfers;
    RETURN NEXT;
END;
$$ LANGUAGE plpgsql;
