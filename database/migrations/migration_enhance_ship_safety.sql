
-- Migration: Enhance Shipping Safety
-- Description: Prevent Shipping if there are still pending Picking Jobs for the order.

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
    v_item_count INT;
    v_box_count INT;
    v_job_id UUID;
    v_user_id UUID;
    v_pending_jobs INT;
BEGIN
    v_user_id := auth.uid();

    -- 1. Get Outbound Order
    SELECT * INTO v_order FROM outbound_orders WHERE id = p_order_id FOR UPDATE;
    IF v_order IS NULL THEN 
        RETURN jsonb_build_object('success', false, 'error', 'Không tìm thấy đơn hàng'); 
    END IF;
    
    IF v_order.status = 'SHIPPED' THEN 
        RETURN jsonb_build_object('success', false, 'error', 'Đơn hàng này đã được xuất kho trước đó'); 
    END IF;

    -- 2. Basic Validation
    IF v_order.status != 'PACKED' AND v_order.status != 'COMPLETED' AND v_order.status != 'PICKING' THEN 
        RETURN jsonb_build_object('success', false, 'error', 'Đơn hàng chưa sẵn sàng (Status: ' || v_order.status || ')'); 
    END IF;

    -- 2.1 SAFETY CHECK: Ensure ALL Picking Jobs for this order are completed
    -- This prevents partial shipping if an order is split across multiple jobs (Wave logic)
    SELECT COUNT(*) INTO v_pending_jobs 
    FROM picking_jobs 
    WHERE outbound_order_id = p_order_id 
    AND status NOT IN ('COMPLETED', 'CANCELLED');

    IF v_pending_jobs > 0 THEN
         RETURN jsonb_build_object('success', false, 'error', 'Không thể xuất kho: Còn ' || v_pending_jobs || ' công việc lấy hàng chưa hoàn thành cho đơn này.');
    END IF;

    -- 3. Calculate Item Count
    SELECT COALESCE(SUM(quantity), 0) INTO v_item_count FROM outbound_order_items WHERE outbound_order_id = p_order_id;
    
    -- 4. Find latest job
    SELECT id INTO v_job_id FROM picking_jobs WHERE outbound_order_id = p_order_id ORDER BY created_at DESC LIMIT 1;

    -- 5. SAFE BOX DETECTION
    SELECT array_agg(DISTINCT id) INTO v_box_ids
    FROM (
        SELECT id FROM boxes WHERE outbound_order_id = p_order_id
        UNION
        SELECT t.box_id AS id
        FROM picking_tasks t
        JOIN picking_jobs j ON t.job_id = j.id
        WHERE j.outbound_order_id = p_order_id
          AND t.status = 'COMPLETED'
          AND j.type = 'BOX_PICK' -- Only Bulk Picks move the source box
    ) AS combined_boxes;

    v_box_count := COALESCE(array_length(v_box_ids, 1), 0);

    -- 6. Generate PXK Code
    BEGIN
        v_pxk_code := generate_pxk_code();
    EXCEPTION WHEN OTHERS THEN
        v_pxk_code := 'PXK-' || substring(p_order_id::text, 1, 8);
    END;

    -- 7. Create Shipment
    INSERT INTO outbound_shipments (
        code, source_type, source_id, created_by, outbound_order_id, picking_job_id, customer_name, box_count, metadata
    )
    VALUES (
        v_pxk_code, v_order.type, p_order_id, v_user_id, p_order_id, v_job_id, COALESCE(v_order.customer_name, 'N/A'), v_box_count,
        jsonb_build_object('item_count', v_item_count, 'order_type', v_order.type)
    )
    RETURNING id INTO v_shipment_id;

    -- 8. Update Order
    UPDATE outbound_orders SET status = 'SHIPPED', updated_at = NOW() WHERE id = p_order_id;

    -- 9. Process Boxes (Clear Location)
    IF v_box_ids IS NOT NULL THEN
        -- Record Transactions
        INSERT INTO transactions (type, entity_type, quantity, sku, reference_id, from_box_id, user_id, note, created_at)
        SELECT 
            'SHIP', 'ITEM', -i.quantity, p.sku, v_shipment_id, i.box_id, v_user_id, 
            'Xuất đơn ' || v_order.code, NOW()
        FROM inventory_items i 
        JOIN products p ON i.product_id = p.id 
        WHERE i.box_id = ANY(v_box_ids);
        
        -- Remove Inventory
        DELETE FROM inventory_items WHERE box_id = ANY(v_box_ids);
        
        -- Clear Location
        UPDATE boxes 
        SET status = 'SHIPPED', 
            updated_at = NOW(),
            location_id = NULL
        WHERE id = ANY(v_box_ids);
    END IF;

    -- 10. Complete Jobs (Already checked they are done, but ensuring consistency)
    -- UPDATE picking_jobs SET status = 'COMPLETED', completed_at = NOW() 
    -- WHERE outbound_order_id = p_order_id AND status != 'COMPLETED';

    RETURN jsonb_build_object('success', true, 'message', 'Xuất kho thành công: ' || v_pxk_code, 'shipment_code', v_pxk_code);
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;
