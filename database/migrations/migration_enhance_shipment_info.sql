-- 1. Enhance Outbound Shipments Table
ALTER TABLE outbound_shipments
ADD COLUMN IF NOT EXISTS order_id UUID REFERENCES orders(id),
ADD COLUMN IF NOT EXISTS transfer_order_id UUID REFERENCES transfer_orders(id),
ADD COLUMN IF NOT EXISTS picking_job_id UUID REFERENCES picking_jobs(id),
ADD COLUMN IF NOT EXISTS customer_name TEXT,
ADD COLUMN IF NOT EXISTS shipping_address TEXT,
ADD COLUMN IF NOT EXISTS carrier_name TEXT,
ADD COLUMN IF NOT EXISTS tracking_code TEXT,
ADD COLUMN IF NOT EXISTS note TEXT;

-- 2. Update Ship Order RPC (with new columns)
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
    v_job_id UUID;
BEGIN
    SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;
    IF v_order IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Không tìm thấy đơn hàng'); END IF;
    IF v_order.status != 'PACKED' THEN RETURN jsonb_build_object('success', false, 'error', 'Đơn hàng chưa đóng gói'); END IF;

    SELECT COALESCE(SUM(quantity), 0) INTO v_item_count FROM order_items WHERE order_id = p_order_id;
    -- Find latest picking job for this order
    SELECT id INTO v_job_id FROM picking_jobs WHERE order_id = p_order_id ORDER BY created_at DESC LIMIT 1;

    v_pxk_code := generate_pxk_code();

    -- Create Outbound Shipment Record with Full Info
    INSERT INTO outbound_shipments (
        code, source_type, source_id, created_by, metadata,
        order_id, picking_job_id, customer_name, shipping_address
    )
    VALUES (
        v_pxk_code, 
        'ORDER', 
        p_order_id,
        auth.uid(),
        jsonb_build_object(
            'customer_name', v_order.customer_name,
            'item_count', v_item_count,
            'original_code', v_order.code
        ),
        p_order_id,
        v_job_id,
        v_order.customer_name,
        v_order.customer_address
    )
    RETURNING id INTO v_shipment_id;

    UPDATE orders SET status = 'SHIPPED' WHERE id = p_order_id;
    
    SELECT array_agg(id) INTO v_box_ids FROM boxes WHERE order_id = p_order_id;

    -- VALIDATION
    IF v_box_ids IS NOT NULL THEN
        DECLARE
            v_actual_qty INT;
        BEGIN
            SELECT COALESCE(SUM(quantity), 0) INTO v_actual_qty FROM inventory_items WHERE box_id = ANY(v_box_ids);
            IF v_actual_qty > v_item_count THEN
                RETURN jsonb_build_object('success', false, 'error', 'Lỗi: Thùng chứa ' || v_actual_qty || ' sp, đơn có ' || v_item_count || '. Vui lòng kiểm tra hàng thừa.');
            END IF;
        END;
    END IF;

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

-- 3. Update Ship Manual Job RPC
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

    SELECT COALESCE(SUM(quantity), 0) INTO v_item_count FROM picking_tasks WHERE job_id = p_job_id;

    v_pxk_code := generate_pxk_code();

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
        -- VALIDATION
        DECLARE
            v_actual_qty INT;
        BEGIN
            SELECT COALESCE(SUM(quantity), 0) INTO v_actual_qty FROM inventory_items WHERE box_id = ANY(v_box_ids);
            IF v_actual_qty > v_item_count THEN
                RETURN jsonb_build_object('success', false, 'error', 'Lỗi: Thùng chứa ' || v_actual_qty || ' sp, đơn chỉ có ' || v_item_count || '.');
            END IF;
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

-- 4. Update Ship Transfer RPC
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
    v_dest_addr TEXT;
    v_item_count INT;
    v_job_id UUID;
BEGIN
    SELECT * INTO v_transfer FROM transfer_orders WHERE id = p_transfer_id FOR UPDATE;
    IF v_transfer.status IN ('SHIPPED', 'COMPLETED') THEN RETURN jsonb_build_object('success', false, 'error', 'Đã xuất'); END IF;

    SELECT name, address INTO v_dest_name, v_dest_addr FROM destinations WHERE id = v_transfer.destination_id;
    SELECT COALESCE(SUM(quantity), 0) INTO v_item_count FROM transfer_order_items WHERE transfer_order_id = p_transfer_id;
    SELECT id INTO v_job_id FROM picking_jobs WHERE transfer_order_id = p_transfer_id ORDER BY created_at DESC LIMIT 1;

    v_pxk_code := generate_pxk_code();

    INSERT INTO outbound_shipments (
        code, source_type, source_id, created_by, metadata,
        transfer_order_id, picking_job_id, customer_name, shipping_address
    )
    VALUES (
        v_pxk_code, 
        'TRANSFER', 
        p_transfer_id,
        auth.uid(),
        jsonb_build_object(
            'destination_name', v_dest_name,
            'item_count', v_item_count,
            'original_code', v_transfer.code
        ),
        p_transfer_id,
        v_job_id,
        v_dest_name,
        v_dest_addr
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
