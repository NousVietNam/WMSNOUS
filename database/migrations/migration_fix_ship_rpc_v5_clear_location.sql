-- Migration: Fix Ship RPCs v5 (Clear Location)
-- Description: Updates ship_outbound_order and ship_manual_job to clear location_id when boxes are shipped.

-- 1. Redefine ship_outbound_order (For Orders)
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
    v_user_id UUID;
    v_item RECORD;
    v_dest_name TEXT;
    v_item_count INT;
BEGIN
    v_user_id := auth.uid();

    -- 1. Get Outbound Order
    SELECT * INTO v_order FROM outbound_orders WHERE id = p_order_id FOR UPDATE;
    IF v_order IS NULL THEN 
        RETURN jsonb_build_object('success', false, 'error', 'Không tìm thấy đơn hàng/phiếu xuất'); 
    END IF;
    
    IF v_order.status = 'SHIPPED' THEN 
        RETURN jsonb_build_object('success', false, 'error', 'Đơn hàng này đã được xuất kho trước đó'); 
    END IF;

    -- 2. Generate PXK Code
    BEGIN
        v_pxk_code := generate_pxk_code();
    EXCEPTION WHEN OTHERS THEN
         v_pxk_code := 'PXK-' || to_char(NOW(), 'YYMMDD') || '-' || substring(p_order_id::text, 1, 4);
    END;

    -- 3. Get Details
    IF v_order.type = 'SALE' OR v_order.type = 'GIFT' THEN
        SELECT name INTO v_dest_name FROM customers WHERE id = v_order.customer_id;
    ELSE
        SELECT name INTO v_dest_name FROM destinations WHERE id = v_order.destination_id;
    END IF;
    
    SELECT COALESCE(SUM(quantity), 0) INTO v_item_count FROM outbound_order_items WHERE order_id = p_order_id;

    -- 4. Create Outbound Shipment Record
    INSERT INTO outbound_shipments (
        code, source_type, source_id, created_by, outbound_order_id, customer_name, metadata
    )
    VALUES (
        v_pxk_code, 
        v_order.type, 
        p_order_id, 
        v_user_id, 
        p_order_id, 
        COALESCE(v_dest_name, 'N/A'),
        jsonb_build_object('original_code', v_order.code, 'type', v_order.type, 'total', v_order.total, 'item_count', v_item_count)
    )
    RETURNING id INTO v_shipment_id;

    -- 5. Process all inventory items in boxes linked to this order
    FOR v_item IN 
        SELECT i.id as inv_item_id, i.box_id, i.product_id, i.quantity, p.sku
        FROM boxes b
        JOIN inventory_items i ON i.box_id = b.id
        JOIN products p ON i.product_id = p.id
        WHERE b.outbound_order_id = p_order_id
    LOOP
        -- A. Create Transaction Entry
        INSERT INTO transactions (type, entity_type, sku, quantity, reference_id, from_box_id, user_id, note, created_at)
        VALUES (
            CASE WHEN v_order.type = 'SALE' THEN 'SHIP' ELSE 'TRANSFER_OUT' END,
            'ITEM', 
            v_item.sku,          
            -v_item.quantity,    
            v_shipment_id, v_item.box_id, v_user_id,
            'Xuất kho ' || v_pxk_code || ' (Đơn: ' || v_order.code || ')',
            NOW()
        );

        -- B. Delete Stock
        DELETE FROM inventory_items WHERE id = v_item.inv_item_id;
    END LOOP;

    -- 5. Mark Boxes as SHIPPED and CLEAR LOCATION
    -- FIX V5: Set location_id = NULL
    UPDATE boxes 
    SET status = 'SHIPPED', 
        updated_at = NOW(),
        location_id = NULL
    WHERE outbound_order_id = p_order_id;

    -- 6. Update Outbound Order
    UPDATE outbound_orders SET status = 'SHIPPED', shipped_at = NOW(), updated_at = NOW() WHERE id = p_order_id;

    -- 7. Complete related jobs
    UPDATE picking_jobs SET status = 'COMPLETED', completed_at = NOW() WHERE outbound_order_id = p_order_id AND status != 'CANCELLED';

    RETURN jsonb_build_object(
        'success', true, 
        'message', 'Xuất kho thành công: ' || v_pxk_code,
        'shipment_code', v_pxk_code
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- 3. Redefine ship_manual_job (For Manual Jobs)
CREATE OR REPLACE FUNCTION ship_manual_job(p_job_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_job RECORD;
    v_box_ids UUID[];
    v_pxk_code TEXT;
    v_shipment_id UUID;
    v_item_count INT;
BEGIN
    SELECT * INTO v_job FROM picking_jobs WHERE id = p_job_id FOR UPDATE;
    IF v_job IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Không tìm thấy Job'); END IF;
    IF v_job.status = 'SHIPPED' THEN RETURN jsonb_build_object('success', false, 'error', 'Job đã xuất'); END IF;

    SELECT COALESCE(SUM(quantity), 0) INTO v_item_count FROM picking_tasks WHERE job_id = p_job_id;

    BEGIN
        v_pxk_code := generate_pxk_code();
    EXCEPTION WHEN OTHERS THEN
        v_pxk_code := 'PXK-' || to_char(NOW(), 'YYMMDD') || '-' || substring(p_job_id::text, 1, 4);
    END;

    INSERT INTO outbound_shipments (
        code, source_type, source_id, created_by, metadata,
        picking_job_id, customer_name, note
    )
    VALUES (
        v_pxk_code, 
        'MANUAL_JOB', 
        p_job_id,
        auth.uid(),
        jsonb_build_object(
            'customer_name', 'Xuất Thủ Công',
            'item_count', v_item_count,
            'original_code', 'JOB-' || substring(p_job_id::text, 1, 8)
        ),
        p_job_id,
        'Xuất Thủ Công',
        'Xuất từ Job ' || 'JOB-' || substring(p_job_id::text, 1, 8)
    )
    RETURNING id INTO v_shipment_id;

    SELECT array_agg(DISTINCT b.id) INTO v_box_ids
    FROM picking_tasks t
    JOIN boxes b ON b.code = t.outbox_code
    WHERE t.job_id = p_job_id AND b.type = 'OUTBOX';

    IF v_box_ids IS NOT NULL THEN
        INSERT INTO transactions (type, entity_type, quantity, sku, reference_id, from_box_id, user_id, note, created_at)
        SELECT 'MISCELLANEOUS_ISSUE', 'ITEM', -i.quantity, p.sku, v_shipment_id, i.box_id, auth.uid(), 'Xuất Job ' || v_pxk_code, NOW()
        FROM inventory_items i JOIN products p ON i.product_id = p.id WHERE i.box_id = ANY(v_box_ids);
        
        DELETE FROM inventory_items WHERE box_id = ANY(v_box_ids);
        
        -- FIX V5: Set location_id = NULL
        UPDATE boxes 
        SET status = 'SHIPPED',
            location_id = NULL
        WHERE id = ANY(v_box_ids);
    END IF;

    UPDATE picking_jobs SET status = 'SHIPPED', completed_at = NOW() WHERE id = p_job_id;

    RETURN jsonb_build_object('success', true, 'message', 'Xuất kho thành công: ' || v_pxk_code);
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;
