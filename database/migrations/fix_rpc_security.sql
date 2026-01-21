-- 1. Grant base schema usage (Just in case)
GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;

-- 2. Update generate_pxk_code to SECURITY DEFINER
CREATE OR REPLACE FUNCTION generate_pxk_code()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER -- Run as owner (postgres)
AS $$
DECLARE
    v_date_str TEXT;
    v_seq INT;
    v_code TEXT;
BEGIN
    v_date_str := to_char(NOW(), 'YYMMDD');
    -- Ensure sequence exists (best effort, ideally strictly managed outside)
    CREATE SEQUENCE IF NOT EXISTS seq_pxk_code; 
    v_seq := nextval('seq_pxk_code');
    v_code := 'PXK-' || v_date_str || '-' || lpad(v_seq::text, 4, '0');
    RETURN v_code;
END;
$$;

-- 3. Update Ship Order RPC to SECURITY DEFINER
CREATE OR REPLACE FUNCTION ship_order(p_order_id UUID)
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
BEGIN
    -- Verify Order
    SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;
    IF v_order IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Không tìm thấy đơn hàng'); END IF;
    IF v_order.status != 'PACKED' THEN RETURN jsonb_build_object('success', false, 'error', 'Đơn hàng chưa đóng gói'); END IF;

    -- Calculate Item Count for Metadata
    SELECT COALESCE(SUM(quantity), 0) INTO v_item_count FROM order_items WHERE order_id = p_order_id;

    -- Generate PXK Code
    v_pxk_code := generate_pxk_code();

    -- Create Outbound Shipment Record
    INSERT INTO outbound_shipments (code, source_type, source_id, created_by, metadata)
    VALUES (
        v_pxk_code, 
        'ORDER', 
        p_order_id,
        auth.uid(),
        jsonb_build_object(
            'customer_name', v_order.customer_name,
            'item_count', v_item_count,
            'original_code', v_order.code
        )
    )
    RETURNING id INTO v_shipment_id;

    -- Update Order
    UPDATE orders SET status = 'SHIPPED' WHERE id = p_order_id;
    
    -- Identify Boxes
    SELECT array_agg(id) INTO v_box_ids FROM boxes WHERE order_id = p_order_id;
    
    -- VALIDATION: Check for extra items (Safety for Orders too)
    IF v_box_ids IS NOT NULL THEN
        DECLARE
            v_actual_qty INT;
        BEGIN
            SELECT COALESCE(SUM(quantity), 0) INTO v_actual_qty FROM inventory_items WHERE box_id = ANY(v_box_ids);
            -- Note: We trust SUM(quantity) here. If items are reserved/locked, logic might be complex.
            -- But for SHIP, we just care if physical count > expected count.
            IF v_actual_qty > v_item_count THEN
                RETURN jsonb_build_object('success', false, 'error', 'Lỗi: Thùng chứa ' || v_actual_qty || ' sp, đơn có ' || v_item_count || '. Vui lòng kiểm tra hàng thừa.');
            END IF;
        END;
    END IF;

    -- Create Transactions
    IF v_box_ids IS NOT NULL THEN
        INSERT INTO transactions (type, entity_type, quantity, sku, reference_id, from_box_id, user_id, note, created_at)
        SELECT 'SHIP', 'ITEM', -i.quantity, p.sku, v_shipment_id, i.box_id, auth.uid(), 'Xuất quy chiếu ' || v_order.code || ' (' || v_pxk_code || ')', NOW()
        FROM inventory_items i JOIN products p ON i.product_id = p.id WHERE i.box_id = ANY(v_box_ids);
        
        DELETE FROM inventory_items WHERE box_id = ANY(v_box_ids);
        UPDATE boxes SET status = 'SHIPPED' WHERE id = ANY(v_box_ids);
    END IF;

    UPDATE picking_jobs SET status = 'COMPLETED' WHERE order_id = p_order_id AND status != 'COMPLETED';

    RETURN jsonb_build_object('success', true, 'message', 'Xuất kho thành công: ' || v_pxk_code);
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- 4. Update Ship Manual Job RPC to SECURITY DEFINER
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
    IF v_job.status = 'SHIPPED' THEN RETURN jsonb_build_object('success', false, 'error', 'Job đã xuất'); END IF;

    -- Item Count
    SELECT COALESCE(SUM(quantity), 0) INTO v_item_count FROM picking_tasks WHERE job_id = p_job_id;

    v_pxk_code := generate_pxk_code();

    INSERT INTO outbound_shipments (code, source_type, source_id, created_by, metadata)
    VALUES (
        v_pxk_code, 
        'MANUAL_JOB', 
        p_job_id,
        auth.uid(),
        jsonb_build_object(
            'customer_name', 'Xuất Thủ Công',
            'item_count', v_item_count,
            'original_code', 'JOB-' || substring(p_job_id::text, 1, 8)
        )
    )
    RETURNING id INTO v_shipment_id;

    SELECT array_agg(DISTINCT b.id) INTO v_box_ids
    FROM picking_tasks t
    JOIN boxes b ON b.code = t.outbox_code
    WHERE t.job_id = p_job_id AND b.type = 'OUTBOX';

    IF v_box_ids IS NOT NULL THEN
        -- VALIDATION: Check for extra items in the boxes
        DECLARE
            v_actual_qty INT;
        BEGIN
            SELECT COALESCE(SUM(quantity), 0) INTO v_actual_qty 
            FROM inventory_items 
            WHERE box_id = ANY(v_box_ids);

            IF v_actual_qty > v_item_count THEN
                RETURN jsonb_build_object('success', false, 'error', 'Lỗi: Thùng chứa ' || v_actual_qty || ' sản phẩm, nhưng đơn chỉ có ' || v_item_count || '. Vui lòng kiểm tra hàng thừa.');
            END IF;
            
            -- Optional: Warn if less? (Might be partial ship, but let's allow it for now or block strictly?)
            -- Usually strict equality is safest for "Full Ship". 
            -- IF v_actual_qty != v_item_count THEN ...
        END;

        INSERT INTO transactions (type, entity_type, quantity, sku, reference_id, from_box_id, user_id, note, created_at)
        SELECT 'MISCELLANEOUS_ISSUE', 'ITEM', -i.quantity, p.sku, v_shipment_id, i.box_id, auth.uid(), 'Xuất Job ' || v_pxk_code, NOW()
        FROM inventory_items i JOIN products p ON i.product_id = p.id WHERE i.box_id = ANY(v_box_ids);
        
        DELETE FROM inventory_items WHERE box_id = ANY(v_box_ids);
        UPDATE boxes SET status = 'SHIPPED' WHERE id = ANY(v_box_ids);
    END IF;

    UPDATE picking_jobs SET status = 'SHIPPED' WHERE id = p_job_id;

    RETURN jsonb_build_object('success', true, 'message', 'Xuất kho thành công: ' || v_pxk_code);
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- 5. Update Ship Transfer RPC to SECURITY DEFINER
CREATE OR REPLACE FUNCTION ship_transfer(p_transfer_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_transfer RECORD;
    v_box_ids UUID[];
    v_pxk_code TEXT;
    v_shipment_id UUID;
    v_dest_name TEXT;
    v_item_count INT;
BEGIN
    SELECT * INTO v_transfer FROM transfer_orders WHERE id = p_transfer_id FOR UPDATE;
    IF v_transfer.status IN ('SHIPPED', 'COMPLETED') THEN RETURN jsonb_build_object('success', false, 'error', 'Đã xuất'); END IF;

    -- Get Destination Name
    SELECT name INTO v_dest_name FROM destinations WHERE id = v_transfer.destination_id;
    -- Get Item Count
    SELECT COALESCE(SUM(quantity), 0) INTO v_item_count FROM transfer_order_items WHERE transfer_order_id = p_transfer_id;

    v_pxk_code := generate_pxk_code();

    INSERT INTO outbound_shipments (code, source_type, source_id, created_by, metadata)
    VALUES (
        v_pxk_code, 
        'TRANSFER', 
        p_transfer_id,
        auth.uid(),
        jsonb_build_object(
            'destination_name', v_dest_name,
            'item_count', v_item_count,
            'original_code', v_transfer.code
        )
    )
    RETURNING id INTO v_shipment_id;

    SELECT array_agg(id) INTO v_box_ids FROM boxes WHERE transfer_order_id = p_transfer_id;

    IF v_box_ids IS NOT NULL THEN
        INSERT INTO transactions (type, entity_type, quantity, sku, reference_id, from_box_id, user_id, note, created_at)
        SELECT 'TRANSFER_OUT', 'ITEM', -i.quantity, p.sku, v_shipment_id, i.box_id, auth.uid(), 'Chuyển kho ' || v_pxk_code, NOW()
        FROM inventory_items i JOIN products p ON i.product_id = p.id WHERE i.box_id = ANY(v_box_ids);
        
        DELETE FROM inventory_items WHERE box_id = ANY(v_box_ids);
        UPDATE boxes SET status = 'SHIPPED' WHERE id = ANY(v_box_ids);
    END IF;

    UPDATE transfer_orders SET status = 'SHIPPED', shipped_at = NOW() WHERE id = p_transfer_id;
    UPDATE picking_jobs SET status = 'COMPLETED' WHERE transfer_order_id = p_transfer_id AND status != 'COMPLETED';

    RETURN jsonb_build_object('success', true, 'message', 'Xuất kho thành công: ' || v_pxk_code);
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;
