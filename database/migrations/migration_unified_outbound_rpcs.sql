-- =====================================================
-- Migration: Unified Outbound RPCs (SOLID & ROBUST - CONSOLIDATED)
-- Version: 20260122_01
-- This file consolidates all core outbound logic and handles
-- structural changes to views using DROP VIEW ... CASCADE.
-- =====================================================

-- 1. CLEAN UP: Drop views and functions to allow restructuring
DROP VIEW IF EXISTS view_product_availability CASCADE;
DROP VIEW IF EXISTS view_product_stock CASCADE;

-- 2. CREATE ROBUST VIEW: Split soft bookings into 4 categories
CREATE VIEW view_product_availability AS
WITH soft_allocation AS (
    -- All Outbound Items (Demand)
    SELECT 
        ooi.product_id, 
        SUM(ooi.quantity) as qty,
        o.type
    FROM outbound_order_items ooi
    JOIN outbound_orders o ON ooi.order_id = o.id
    WHERE o.is_approved = TRUE 
      AND o.status NOT IN ('ALLOCATED', 'PICKING', 'PACKED', 'SHIPPED', 'COMPLETED', 'CANCELLED')
    GROUP BY ooi.product_id, o.type
),
aggregated_soft AS (
    SELECT 
        product_id, 
        SUM(CASE WHEN type = 'SALE' THEN qty ELSE 0 END) as soft_sale,
        SUM(CASE WHEN type = 'GIFT' THEN qty ELSE 0 END) as soft_gift,
        SUM(CASE WHEN type = 'INTERNAL' THEN qty ELSE 0 END) as soft_internal,
        SUM(CASE WHEN type = 'TRANSFER' THEN qty ELSE 0 END) as soft_transfer
    FROM soft_allocation
    GROUP BY product_id
)
SELECT 
    p.id as product_id,
    p.sku,
    p.name,
    COALESCE(SUM(i.quantity), 0) as total_quantity,
    COALESCE(SUM(i.allocated_quantity), 0) as hard_allocated,
    
    COALESCE(s.soft_sale, 0) as soft_booked_sale,
    COALESCE(s.soft_gift, 0) as soft_booked_gift,
    COALESCE(s.soft_internal, 0) as soft_booked_internal,
    COALESCE(s.soft_transfer, 0) as soft_booked_transfer,
    
    -- Real Available = Total - Hard - All Soft
    GREATEST(0, 
        COALESCE(SUM(i.quantity), 0) 
        - COALESCE(SUM(i.allocated_quantity), 0) 
        - COALESCE(s.soft_sale, 0) 
        - COALESCE(s.soft_gift, 0) 
        - COALESCE(s.soft_internal, 0) 
        - COALESCE(s.soft_transfer, 0)
    ) as available_quantity
FROM products p
LEFT JOIN inventory_items i ON p.id = i.product_id
LEFT JOIN aggregated_soft s ON p.id = s.product_id
GROUP BY p.id, p.sku, p.name, s.soft_sale, s.soft_gift, s.soft_internal, s.soft_transfer;

GRANT SELECT ON view_product_availability TO authenticated;
GRANT SELECT ON view_product_availability TO anon;

-- 3. APPROVE FUNCTION: Grouped SKU Logic
CREATE OR REPLACE FUNCTION approve_outbound(p_order_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_order RECORD;
    v_item RECORD;
    v_missing JSONB := '[]'::JSONB;
    v_available INT;
BEGIN
    SELECT * INTO v_order FROM outbound_orders WHERE id = p_order_id;
    
    IF v_order IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Không tìm thấy đơn hàng');
    END IF;

    IF v_order.is_approved THEN
         RETURN jsonb_build_object('success', false, 'error', 'Đơn hàng đã được duyệt rồi');
    END IF;

    -- Check availability for grouped items
    FOR v_item IN 
        SELECT 
            product_id, 
            SUM(quantity) as quantity,
            (SELECT sku FROM products WHERE id = product_id) as sku
        FROM outbound_order_items 
        WHERE order_id = p_order_id 
        GROUP BY product_id 
    LOOP
        -- Get current availability
        SELECT available_quantity INTO v_available
        FROM view_product_availability 
        WHERE product_id = v_item.product_id;
        
        -- If total requested > available, add to missing list
        IF COALESCE(v_available, 0) < v_item.quantity THEN
             v_missing := v_missing || jsonb_build_object(
                'product_id', v_item.product_id,
                'sku', v_item.sku,
                'requested', v_item.quantity,
                'available', COALESCE(v_available, 0)
             );
        END IF;
    END LOOP;

    -- If missing items, return error details
    IF jsonb_array_length(v_missing) > 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Không đủ tồn kho khả dụng', 'missing', v_missing);
    END IF;

    -- Approve
    UPDATE outbound_orders 
    SET is_approved = TRUE, 
        approved_at = NOW(), 
        approved_by = auth.uid() 
    WHERE id = p_order_id;

    RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION approve_outbound(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION approve_outbound(UUID) TO anon;

-- 4. UNAPPROVE FUNCTION
CREATE OR REPLACE FUNCTION unapprove_outbound(p_order_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_order RECORD;
BEGIN
    SELECT * INTO v_order FROM outbound_orders WHERE id = p_order_id;
    
    IF v_order IS NULL THEN
         RETURN jsonb_build_object('success', false, 'error', 'Không tìm thấy đơn hàng');
    END IF;

    IF NOT v_order.is_approved THEN
         RETURN jsonb_build_object('success', false, 'error', 'Đơn hàng chưa được duyệt');
    END IF;

    -- Check if picking jobs exist (cannot unapprove if jobs started)
    PERFORM 1 FROM picking_jobs WHERE outbound_order_id = p_order_id;
    IF FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Không thể hủy duyệt: Đã có lệnh nhặt hàng (Picking Job). Vui lòng xóa job trước.');
    END IF;

    -- Unapprove
    UPDATE outbound_orders 
    SET is_approved = FALSE, 
        approved_at = NULL, 
        approved_by = NULL 
    WHERE id = p_order_id;

    RETURN jsonb_build_object('success', true);
END;
$$;

-- 5. ALLOCATE FUNCTION: Respect from_box_id
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
        
        FOR v_inv IN
            SELECT ii.id, ii.box_id, ii.quantity, ii.allocated_quantity, b.code as box_code
            FROM inventory_items ii
            JOIN boxes b ON ii.box_id = b.id
            WHERE ii.product_id = v_item.product_id
              AND ii.quantity > COALESCE(ii.allocated_quantity, 0)
              AND b.status = 'OPEN'
              AND (v_item.from_box_id IS NULL OR ii.box_id = v_item.from_box_id)
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
                VALUES ('RESERVE', 'ITEM', v_item.sku, v_take, p_order_id, v_inv.box_id, auth.uid(), 'Phân bổ cho đơn ' || v_order.code, NOW());
                
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

-- 6. RELEASE FUNCTION
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
    IF v_order.status != 'ALLOCATED' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Chỉ có thể hủy phân bổ đơn đang ở trạng thái ALLOCATED');
    END IF;

    FOR v_task IN 
        SELECT pt.*, p.sku 
        FROM picking_tasks pt
        JOIN picking_jobs pj ON pt.job_id = pj.id
        JOIN products p ON pt.product_id = p.id
        WHERE pj.outbound_order_id = p_order_id AND pj.status = 'PLANNED'
    LOOP
        UPDATE inventory_items
        SET allocated_quantity = GREATEST(0, allocated_quantity - v_task.quantity)
        WHERE box_id = v_task.box_id AND product_id = v_task.product_id;
        
        INSERT INTO transactions (type, entity_type, sku, quantity, reference_id, from_box_id, user_id, note, created_at)
        VALUES ('RELEASE', 'ITEM', v_task.sku, v_task.quantity, p_order_id, v_task.box_id, auth.uid(), 'Hủy phân bổ đơn ' || v_order.code, NOW());
    END LOOP;

    DELETE FROM picking_jobs WHERE outbound_order_id = p_order_id AND status = 'PLANNED';
    UPDATE outbound_orders SET status = 'APPROVED' WHERE id = p_order_id;
    RETURN jsonb_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- 7. SHIP FUNCTION
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
BEGIN
    SELECT * INTO v_order FROM outbound_orders WHERE id = p_order_id FOR UPDATE;
    IF v_order.status NOT IN ('ALLOCATED', 'PICKING', 'PACKED') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Đơn hàng chưa sẵn sàng xuất (Status: ' || v_order.status || ')');
    END IF;

    v_pxk_code := 'PXK-' || to_char(NOW(), 'YYMMDD') || '-' || substring(p_order_id::text from 1 for 4);
    
    IF v_order.type = 'SALE' THEN
        SELECT name INTO v_dest_name FROM customers WHERE id = v_order.customer_id;
    ELSE
        SELECT name INTO v_dest_name FROM destinations WHERE id = v_order.destination_id;
    END IF;

    INSERT INTO outbound_shipments (code, source_type, source_id, created_by, customer_name, metadata)
    VALUES (v_pxk_code, v_order.type, p_order_id, auth.uid(), COALESCE(v_dest_name, 'N/A'), jsonb_build_object('total', v_order.total))
    RETURNING id INTO v_shipment_id;

    FOR v_task IN 
        SELECT pt.box_id, pt.product_id, pt.quantity, p.sku
        FROM picking_tasks pt
        JOIN picking_jobs pj ON pt.job_id = pj.id
        JOIN products p ON pt.product_id = p.id
        WHERE pj.outbound_order_id = p_order_id
    LOOP
        UPDATE inventory_items
        SET quantity = quantity - v_task.quantity,
            allocated_quantity = allocated_quantity - v_task.quantity
        WHERE box_id = v_task.box_id AND product_id = v_task.product_id;

        DELETE FROM inventory_items WHERE box_id = v_task.box_id AND product_id = v_task.product_id AND quantity <= 0;

        INSERT INTO transactions (type, entity_type, sku, quantity, reference_id, from_box_id, user_id, note, created_at)
        VALUES (CASE WHEN v_order.type = 'SALE' THEN 'SHIP' ELSE 'TRANSFER_OUT' END, 'ITEM', v_task.sku, -v_task.quantity, v_shipment_id, v_task.box_id, auth.uid(), 'Xuất kho đơn ' || v_order.code, NOW());
    END LOOP;

    UPDATE outbound_orders SET status = 'SHIPPED', shipped_at = NOW() WHERE id = p_order_id;
    UPDATE picking_jobs SET status = 'COMPLETED' WHERE outbound_order_id = p_order_id;
    UPDATE picking_tasks SET status = 'PICKED' WHERE status = 'PENDING' AND job_id IN (SELECT id FROM picking_jobs WHERE outbound_order_id = p_order_id);

    RETURN jsonb_build_object('success', true, 'code', v_pxk_code);
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- 8. INVENTORY SUMMARY (Consistent with View)
DO $$ 
DECLARE 
    r RECORD;
BEGIN
    FOR r IN (SELECT oid::regprocedure as proc_name FROM pg_proc WHERE proname = 'get_inventory_summary') 
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.proc_name;
    END LOOP;
END $$;

CREATE FUNCTION get_inventory_summary(
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
    total_approved_sale BIGINT,
    total_approved_gift BIGINT,
    total_approved_internal BIGINT,
    total_approved_transfer BIGINT,
    available_detail BIGINT,
    available_summary BIGINT
)
AS $$
DECLARE
    v_total_qty BIGINT;
    v_total_allocated BIGINT;
    v_total_sale BIGINT;
    v_total_gift BIGINT;
    v_total_internal BIGINT;
    v_total_transfer BIGINT;
BEGIN
    SELECT COALESCE(SUM(i.quantity), 0), COALESCE(SUM(i.allocated_quantity), 0) INTO v_total_qty, v_total_allocated
    FROM inventory_items i
    JOIN products p ON i.product_id = p.id
    LEFT JOIN boxes b ON i.box_id = b.id
    LEFT JOIN locations l_box ON b.location_id = l_box.id
    LEFT JOIN locations l_direct ON i.location_id = l_direct.id
    WHERE (p_warehouse_id IS NULL OR i.warehouse_id = p_warehouse_id) AND (p_brand IS NULL OR p.brand = p_brand) AND (p_target_audience IS NULL OR p.target_audience = p_target_audience) AND (p_product_group IS NULL OR p.product_group = p_product_group) AND (p_season IS NULL OR p.season = p_season) AND (p_launch_month IS NULL OR p.launch_month::text = p_launch_month) AND (p_location_code IS NULL OR COALESCE(l_box.code, l_direct.code) = p_location_code) AND (p_box_code IS NULL OR b.code = p_box_code) AND (p_search IS NULL OR (p.name ILIKE '%' || p_search || '%' OR p.sku ILIKE '%' || p_search || '%' OR (p.barcode IS NOT NULL AND p.barcode ILIKE '%' || p_search || '%')));

    SELECT 
        COALESCE(SUM(CASE WHEN type = 'SALE' THEN calc_qty ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN type = 'GIFT' THEN calc_qty ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN type = 'INTERNAL' THEN calc_qty ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN type = 'TRANSFER' THEN calc_qty ELSE 0 END), 0)
    INTO v_total_sale, v_total_gift, v_total_internal, v_total_transfer
    FROM (
        SELECT ooi.quantity as calc_qty, o.type
        FROM outbound_order_items ooi
        JOIN outbound_orders o ON ooi.order_id = o.id
        WHERE o.is_approved = TRUE AND o.status NOT IN ('ALLOCATED', 'PICKING', 'PACKED', 'SHIPPED', 'COMPLETED', 'CANCELLED')
    ) combined;

    total_quantity := v_total_qty;
    total_allocated := v_total_allocated;
    total_approved_sale := v_total_sale;
    total_approved_gift := v_total_gift;
    total_approved_internal := v_total_internal;
    total_approved_transfer := v_total_transfer;
    available_detail := GREATEST(0, v_total_qty - v_total_allocated);
    available_summary := GREATEST(0, v_total_qty - v_total_allocated - v_total_sale - v_total_gift - v_total_internal - v_total_transfer);
    RETURN NEXT;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION get_inventory_summary(text,text,text,text,text,text,text,text,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_inventory_summary(text,text,text,text,text,text,text,text,uuid) TO anon;
