
-- Migration: Add Manual Packing Confirmation RPC
-- Description: Allows users to manually confirm an order is packed (e.g., from Sorting Table)

CREATE OR REPLACE FUNCTION confirm_order_packed(
    p_order_id UUID,
    p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_source_type TEXT;
    v_order_code TEXT;
    v_pxk_code TEXT;
    v_item_count INT;
    v_status TEXT;
BEGIN
    -- 1. Get current status
    SELECT status, code, CASE WHEN type = 'SALE' THEN 'ORDER' ELSE 'TRANSFER' END
    INTO v_status, v_order_code, v_source_type
    FROM outbound_orders WHERE id = p_order_id;

    IF v_status = 'PACKED' OR v_status = 'SHIPPED' OR v_status = 'COMPLETED' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Đơn hàng này đã được đóng gói hoặc xuất kho rồi.');
    END IF;

    -- 2. Update Status
    UPDATE outbound_orders 
    SET status = 'PACKED', updated_at = NOW() 
    WHERE id = p_order_id;

    -- 3. Create Shipment (if not exists)
    IF NOT EXISTS (SELECT 1 FROM outbound_shipments WHERE source_id = p_order_id) THEN
        v_pxk_code := generate_pxk_code();
        
        SELECT SUM(quantity) INTO v_item_count 
        FROM outbound_order_items
        WHERE order_id = p_order_id;

        INSERT INTO outbound_shipments (code, source_type, source_id, created_by, metadata)
        VALUES (
            v_pxk_code, v_source_type, p_order_id, p_user_id,
            jsonb_build_object('order_code', v_order_code, 'item_count', v_item_count, 'confirmed_at_sorting', true)
        );
    END IF;

    RETURN jsonb_build_object('success', true);
END;
$$;
