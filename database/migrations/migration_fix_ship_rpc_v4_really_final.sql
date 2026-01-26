-- Migration: Fix Ship RPCs v4 (Fix column mismatch)
-- Description: Corrects the INSERT INTO transactions column order which was swapped in v3.

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
        -- FIX V4: Corrected column order: sku THEN quantity
        INSERT INTO transactions (type, entity_type, sku, quantity, reference_id, from_box_id, user_id, note, created_at)
        VALUES (
            CASE WHEN v_order.type = 'SALE' THEN 'SHIP' ELSE 'TRANSFER_OUT' END,
            'ITEM', 
            v_item.sku,          -- SKU (Text)
            -v_item.quantity,    -- Quantity (Int)
            v_shipment_id, v_item.box_id, v_user_id,
            'Xuất kho ' || v_pxk_code || ' (Đơn: ' || v_order.code || ')',
            NOW()
        );

        -- B. Delete Stock
        DELETE FROM inventory_items WHERE id = v_item.inv_item_id;
    END LOOP;

    -- 5. Mark Boxes as SHIPPED
    UPDATE boxes SET status = 'SHIPPED', updated_at = NOW() WHERE outbound_order_id = p_order_id;

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
