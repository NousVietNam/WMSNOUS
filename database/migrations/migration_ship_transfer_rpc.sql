-- Function to Ship a Transfer Order Atomically
CREATE OR REPLACE FUNCTION ship_transfer(p_transfer_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_transfer RECORD;
    v_box_ids UUID[];
    v_tx_count INT := 0;
BEGIN
    -- 1. Verify Transfer Order and Lock it
    SELECT * INTO v_transfer FROM transfer_orders WHERE id = p_transfer_id FOR UPDATE;
    
    IF v_transfer IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Không tìm thấy phiếu điều chuyển');
    END IF;

    IF v_transfer.status IN ('SHIPPED', 'COMPLETED') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Phiếu này đã được xuất rồi');
    END IF;

    -- 2. Identify Boxes associated with this transfer
    SELECT array_agg(id) INTO v_box_ids FROM boxes WHERE transfer_order_id = p_transfer_id;
    
    IF v_box_ids IS NULL OR array_length(v_box_ids, 1) = 0 THEN
         -- Optional: Allow shipping even if no boxes? (Maybe just status update)
         -- For now, let's allow it but warn or just proceed.
         -- But to be consistent with inventory logic, usually we need boxes.
         -- If no boxes, maybe it was a manual transfer without system boxes?
         -- Let's assume we proceed to update status regardless, considering it might be empty.
         NULL; 
    END IF;

    -- 3. Create Transactions (TRANSFER_OUT)
    IF v_box_ids IS NOT NULL THEN
        INSERT INTO transactions (type, entity_type, quantity, sku, reference_id, from_box_id, note, created_at)
        SELECT 
            'TRANSFER_OUT',
            'ITEM',
            -i.quantity,
            p.sku,
            p_transfer_id,
            i.box_id,
            'Xuất điều chuyển: ' || v_transfer.code,
            NOW()
        FROM inventory_items i
        JOIN products p ON i.product_id = p.id
        WHERE i.box_id = ANY(v_box_ids);

        GET DIAGNOSTICS v_tx_count = ROW_COUNT;

        -- 4. Delete Inventory (It leaves the current warehouse)
        DELETE FROM inventory_items WHERE box_id = ANY(v_box_ids);

        -- 5. Update Box Status
        UPDATE boxes SET status = 'SHIPPED' WHERE id = ANY(v_box_ids);
    END IF;

    -- 6. Update Transfer Order Status
    UPDATE transfer_orders SET status = 'SHIPPED', shipped_at = NOW() WHERE id = p_transfer_id;

    -- 7. Close Picking Jobs associated with this Transfer
    UPDATE picking_jobs SET status = 'COMPLETED' WHERE transfer_order_id = p_transfer_id AND status != 'COMPLETED';

    RETURN jsonb_build_object('success', true, 'message', 'Xuất điều chuyển thành công', 'tx_count', v_tx_count);

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;
