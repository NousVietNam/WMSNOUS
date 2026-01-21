-- =====================================================
-- Migration: Unified Outbound RPCs
-- Phase 3: Allocate and Ship functions
-- =====================================================

-- 0. Update View for Soft Allocation (Unified)
CREATE OR REPLACE VIEW view_product_availability AS
WITH soft_allocation AS (
    -- Unified Outbound Orders (Approved but not shipped)
    SELECT 
        ooi.product_id, 
        SUM(ooi.quantity) as qty,
        CASE WHEN o.type IN ('TRANSFER', 'INTERNAL') THEN 'TRANSFER' ELSE 'ORDER' END as type
    FROM outbound_order_items ooi
    JOIN outbound_orders o ON ooi.order_id = o.id
    WHERE o.is_approved = TRUE 
      AND o.status NOT IN ('SHIPPED', 'COMPLETED', 'CANCELLED')
    GROUP BY ooi.product_id, o.type
),
aggregated_soft AS (
    SELECT 
        product_id, 
        SUM(CASE WHEN type = 'ORDER' THEN qty ELSE 0 END) as soft_orders,
        SUM(CASE WHEN type = 'TRANSFER' THEN qty ELSE 0 END) as soft_transfers
    FROM soft_allocation
    GROUP BY product_id
)
SELECT 
    p.id as product_id,
    p.sku,
    p.name,
    COALESCE(SUM(i.quantity), 0) as total_quantity,
    COALESCE(SUM(i.allocated_quantity), 0) as hard_allocated,
    
    COALESCE(s.soft_orders, 0) as soft_booked_orders,
    COALESCE(s.soft_transfers, 0) as soft_booked_transfers,
    
    -- Real Available = Total - Hard - Soft(Orders) - Soft(Transfers)
    GREATEST(0, 
        COALESCE(SUM(i.quantity), 0) 
        - COALESCE(SUM(i.allocated_quantity), 0) 
        - COALESCE(s.soft_orders, 0) 
        - COALESCE(s.soft_transfers, 0)
    ) as available_quantity
FROM products p
LEFT JOIN inventory_items i ON p.id = i.product_id
LEFT JOIN aggregated_soft s ON p.id = s.product_id
GROUP BY p.id, p.sku, p.name, s.soft_orders, s.soft_transfers;

-- 0.5. Approve Outbound Order
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

    -- Check availability for each item
    FOR v_item IN SELECT * FROM outbound_order_items WHERE order_id = p_order_id LOOP
        -- Get current availability (which already subtracts Hard & Soft of OTHER orders)
        SELECT available_quantity INTO v_available
        FROM view_product_availability 
        WHERE product_id = v_item.product_id;
        
        -- If requested > available, add to missing list
        IF COALESCE(v_available, 0) < v_item.quantity THEN
             v_missing := v_missing || jsonb_build_object(
                'product_id', v_item.product_id,
                'sku', (SELECT sku FROM products WHERE id = v_item.product_id),
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

-- 0.6. Unapprove Outbound Order
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

-- 1. Allocate Outbound Order (High Precision)
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
    v_allocated_count INT := 0;
    v_job_id UUID;
    v_errors TEXT[] := ARRAY[]::TEXT[];
BEGIN
    -- 1. Get Order
    SELECT * INTO v_order FROM outbound_orders WHERE id = p_order_id FOR UPDATE;
    IF v_order IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Không tìm thấy đơn hàng');
    END IF;
    
    IF v_order.status != 'APPROVED' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Đơn hàng phải ở trạng thái APPROVED mới được Phân Bổ');
    END IF;

    -- 2. Create PLANNED Job (Container for tasks)
    INSERT INTO picking_jobs (outbound_order_id, type, status, created_at)
    VALUES (p_order_id, 
            CASE WHEN v_order.type IN ('TRANSFER', 'INTERNAL') AND v_order.transfer_type = 'BOX' THEN 'BOX_PICK' ELSE 'ITEM_PICK' END,
            'PLANNED', 
            NOW())
    RETURNING id INTO v_job_id;

    -- 3. Loop through items to allocate
    FOR v_item IN 
        SELECT ooi.*, p.sku 
        FROM outbound_order_items ooi
        JOIN products p ON ooi.product_id = p.id
        WHERE ooi.order_id = p_order_id
        ORDER BY ooi.id
    LOOP
        v_remaining := v_item.quantity;
        
        -- Strategy: FIFO/FEFO based on created_at or expiry if available
        -- Prioritize Storage boxes
        FOR v_inv IN
            SELECT ii.id, ii.box_id, ii.quantity, ii.allocated_quantity, b.code as box_code
            FROM inventory_items ii
            JOIN boxes b ON ii.box_id = b.id
            WHERE ii.product_id = v_item.product_id
              AND ii.quantity > COALESCE(ii.allocated_quantity, 0)
              AND b.type = 'STORAGE'
              AND b.status = 'OPEN' -- Only open boxes
            ORDER BY ii.created_at ASC 
            FOR UPDATE OF ii
        LOOP
            IF v_remaining <= 0 THEN EXIT; END IF;
            
            -- Calculate fetchable amount
            v_take := LEAST(v_inv.quantity - COALESCE(v_inv.allocated_quantity, 0), v_remaining);
            
            IF v_take > 0 THEN
                -- A. Create Picking Task (Hard Allocation Record)
                INSERT INTO picking_tasks (job_id, order_item_id, product_id, box_id, quantity, status, created_at)
                VALUES (v_job_id, v_item.id, v_item.product_id, v_inv.box_id, v_take, 'PENDING', NOW());
                
                -- B. Update Inventory (Increment Allocated)
                UPDATE inventory_items
                SET allocated_quantity = COALESCE(allocated_quantity, 0) + v_take
                WHERE id = v_inv.id;
                
                -- C. Create Transaction Log (RESERVE) - Detailed per Box
                INSERT INTO transactions (type, entity_type, sku, quantity, reference_id, from_box_id, user_id, note, created_at)
                VALUES ('RESERVE', 'ITEM', v_item.sku, v_take, p_order_id, v_inv.box_id, auth.uid(), 'Phân bổ cho đơn ' || v_order.code, NOW());
                
                v_remaining := v_remaining - v_take;
            END IF;
        END LOOP;
        
        IF v_remaining > 0 THEN
            v_errors := array_append(v_errors, 'Thiếu ' || v_remaining || ' ' || v_item.sku);
        END IF;
    END LOOP;

    -- 4. Finalize
    IF array_length(v_errors, 1) > 0 THEN
        -- Rollback if strict (or allow partial?) -> For now, strict: Error if not fully allocated.
        RAISE EXCEPTION 'Không đủ hàng phân bổ: %', v_errors;
    END IF;

    -- Update Order Status
    UPDATE outbound_orders 
    SET status = 'ALLOCATED', allocated_at = NOW() 
    WHERE id = p_order_id;

    RETURN jsonb_build_object('success', true, 'job_id', v_job_id);
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- 2. Release Outbound Order (Un-Allocate)
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

    -- Loop through tasks to release inventory
    FOR v_task IN 
        SELECT pt.*, p.sku 
        FROM picking_tasks pt
        JOIN picking_jobs pj ON pt.job_id = pj.id
        JOIN products p ON pt.product_id = p.id
        WHERE pj.outbound_order_id = p_order_id 
          AND pj.status = 'PLANNED' -- Only release planned jobs
    LOOP
        -- A. Revert Inventory Allocation
        UPDATE inventory_items
        SET allocated_quantity = GREATEST(0, allocated_quantity - v_task.quantity)
        WHERE box_id = v_task.box_id AND product_id = v_task.product_id;
        
        -- B. Create Transaction Log (RELEASE)
        INSERT INTO transactions (type, entity_type, sku, quantity, reference_id, from_box_id, user_id, note, created_at)
        VALUES ('RELEASE', 'ITEM', v_task.sku, v_task.quantity, p_order_id, v_task.box_id, auth.uid(), 'Hủy phân bổ đơn ' || v_order.code, NOW());
    END LOOP;

    -- Delete Jobs and Tasks
    DELETE FROM picking_jobs WHERE outbound_order_id = p_order_id AND status = 'PLANNED';

    -- Update Order Status
    UPDATE outbound_orders SET status = 'APPROVED' WHERE id = p_order_id;

    RETURN jsonb_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- 3. Create Picking Job (Release to App)
CREATE OR REPLACE FUNCTION create_picking_job_from_planned(p_job_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE picking_jobs 
    SET status = 'OPEN' 
    WHERE id = p_job_id AND status = 'PLANNED';
    
    RETURN jsonb_build_object('success', true);
END;
$$;

-- 4. Ship Outbound Order (Finalize)
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
BEGIN
    -- 1. Get Order
    SELECT * INTO v_order FROM outbound_orders WHERE id = p_order_id FOR UPDATE;
    IF v_order IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Không tìm thấy đơn hàng');
    END IF;
    
    -- Allow shipping from Allocated (Skipped Pick) or Packed
    IF v_order.status NOT IN ('ALLOCATED', 'PICKING', 'PACKED') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Đơn hàng chưa sẵn sàng xuất (Status: ' || v_order.status || ')');
    END IF;

    -- 2. Generate PXK & Shipment Header
    v_pxk_code := 'PXK-' || to_char(NOW(), 'YYMMDD') || '-' || substring(p_order_id::text from 1 for 4); -- Simple Gen
    -- Ideally use generate_pxk_code() if exists, else fallback
    
    IF v_order.type = 'SALE' THEN
        SELECT name INTO v_dest_name FROM customers WHERE id = v_order.customer_id;
    ELSE
        SELECT name INTO v_dest_name FROM destinations WHERE id = v_order.destination_id;
    END IF;

    -- Count Items
    SELECT SUM(picked_quantity) INTO v_item_count 
    FROM outbound_order_items 
    WHERE order_id = p_order_id;
    IF v_item_count IS NULL OR v_item_count = 0 THEN
        SELECT SUM(quantity) INTO v_item_count FROM outbound_order_items WHERE order_id = p_order_id;
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
    -- Tasks hold the truth of what was allocated/picked from where
    FOR v_task IN 
        SELECT pt.box_id, pt.product_id, pt.quantity, p.sku
        FROM picking_tasks pt
        JOIN picking_jobs pj ON pt.job_id = pj.id
        JOIN products p ON pt.product_id = p.id
        WHERE pj.outbound_order_id = p_order_id
        -- AND pj.status != 'CANCELLED' 
    LOOP
        -- A. Deduct Inventory
        -- Logic: Reduce Quantity AND Allocated Quantity
        UPDATE inventory_items
        SET quantity = quantity - v_task.quantity,
            allocated_quantity = allocated_quantity - v_task.quantity
        WHERE box_id = v_task.box_id AND product_id = v_task.product_id;

        -- B. Cleanup Empty Inventory
        DELETE FROM inventory_items 
        WHERE box_id = v_task.box_id AND product_id = v_task.product_id AND quantity <= 0;

        -- C. Create Transaction (SHIP)
        INSERT INTO transactions (type, entity_type, sku, quantity, reference_id, from_box_id, user_id, note, created_at)
        VALUES (
            CASE WHEN v_order.type = 'SALE' THEN 'SHIP' ELSE 'TRANSFER_OUT' END,
            'ITEM',
            v_task.sku,
            -v_task.quantity, -- Negative for OUT
            v_shipment_id,
            v_task.box_id,
            auth.uid(),
            'Xuất kho đơn ' || v_order.code || ' (' || v_pxk_code || ')',
            NOW()
        );
    END LOOP;

    -- 4. Update Boxes (If Box Picking, mark box as Shipped?)
    -- Only if Empty? Or if Box Type? 
    -- For safety, update status SHIPPED if it was a Transfer Box or explicitly full box ship.
    -- For now, leave box status as OPEN unless empty? 
    -- Let's skip auto-closing boxes to avoid side effects, unless strictly Box Mode.
    
    -- 5. Finalize Order & Jobs
    UPDATE outbound_orders SET status = 'SHIPPED', shipped_at = NOW() WHERE id = p_order_id;
    UPDATE picking_jobs SET status = 'COMPLETED' WHERE outbound_order_id = p_order_id;
    UPDATE picking_tasks SET status = 'PICKED' WHERE status = 'PENDING' AND job_id IN (SELECT id FROM picking_jobs WHERE outbound_order_id = p_order_id);

    RETURN jsonb_build_object('success', true, 'code', v_pxk_code);
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;
