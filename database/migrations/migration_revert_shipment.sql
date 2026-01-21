-- Function to Revert a Shipment (Undo/Cancel)
CREATE OR REPLACE FUNCTION revert_shipment(p_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_shipment RECORD;
    v_trans RECORD;
    v_product_id UUID;
    v_restored_count INT := 0;
BEGIN
    -- 1. Find Shipment
    SELECT * INTO v_shipment FROM outbound_shipments WHERE code = p_code;
    IF v_shipment IS NULL THEN 
        RETURN jsonb_build_object('success', false, 'error', 'Không tìm thấy phiếu xuất: ' || p_code); 
    END IF;

    -- 2. Restore Inventory from Transactions
    -- Transactions for SHIP are negative quantities. We reverse them.
    FOR v_trans IN 
        SELECT * FROM transactions WHERE reference_id = v_shipment.id AND type IN ('SHIP', 'MISCELLANEOUS_ISSUE', 'TRANSFER_OUT')
    LOOP
        -- Find Product ID
        SELECT id INTO v_product_id FROM products WHERE sku = v_trans.sku;
        
        IF v_product_id IS NOT NULL THEN
            -- Restore Item
            INSERT INTO inventory_items (box_id, product_id, quantity, created_at)
            VALUES (v_trans.from_box_id, v_product_id, ABS(v_trans.quantity), NOW());
            
            v_restored_count := v_restored_count + 1;
        END IF;
    END LOOP;

    -- 3. Delete Transactions
    DELETE FROM transactions WHERE reference_id = v_shipment.id;

    -- 4. Reset Box Status
    -- Find all boxes involved (from transactions)
    -- Optimization: We can't easily know exact previous status, but usually it's 'PACKED' for Orders/Transfers or just keeping it 'OUTBOX' for Jobs.
    -- Let's set to 'PACKED' which is safe for shipping-ready boxes.
    UPDATE boxes 
    SET status = 'PACKED' 
    WHERE id IN (
        SELECT DISTINCT from_box_id FROM transactions WHERE reference_id = v_shipment.id AND from_box_id IS NOT NULL
    );

    -- 5. Reset Source ID Status
    IF v_shipment.source_type = 'ORDER' THEN
        UPDATE orders SET status = 'PACKED' WHERE id = v_shipment.source_id;
        -- Also Reset Picking Job?
        UPDATE picking_jobs SET status = 'COMPLETED' WHERE order_id = v_shipment.source_id;
        
    ELSIF v_shipment.source_type = 'MANUAL_JOB' THEN
        -- Manual Job revert to COMPLETED (Ready to ship)
        UPDATE picking_jobs SET status = 'COMPLETED' WHERE id = v_shipment.source_id;
        
    ELSIF v_shipment.source_type = 'TRANSFER' THEN
        UPDATE transfer_orders SET status = 'packed', shipped_at = NULL WHERE id = v_shipment.source_id;
        UPDATE picking_jobs SET status = 'COMPLETED' WHERE transfer_order_id = v_shipment.source_id;
    END IF;

    -- 6. Delete Shipment
    DELETE FROM outbound_shipments WHERE id = v_shipment.id;

    RETURN jsonb_build_object('success', true, 'message', 'Đã hủy phiếu ' || p_code || ' và khôi phục tồn kho.');
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;
