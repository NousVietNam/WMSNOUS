-- Function to Ship an Order Atomically
CREATE OR REPLACE FUNCTION ship_order(p_order_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_order RECORD;
    v_box_ids UUID[];
    v_inv RECORD;
    v_tx_count INT := 0;
BEGIN
    -- 1. Verify Order and Lock it
    SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;
    
    IF v_order IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Không tìm thấy đơn hàng');
    END IF;

    IF v_order.status != 'PACKED' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Đơn hàng phải ở trạng thái ĐÃ ĐÓNG GÓI (PACKED)');
    END IF;

    -- 2. Identify Boxes
    SELECT array_agg(id) INTO v_box_ids FROM boxes WHERE order_id = p_order_id;
    
    IF v_box_ids IS NULL OR array_length(v_box_ids, 1) = 0 THEN
         RETURN jsonb_build_object('success', false, 'error', 'Không tìm thấy kiện hàng nào để xuất');
    END IF;

    -- 3. Create Transactions (Log before delete)
    -- We can do insert select
    INSERT INTO transactions (type, entity_type, quantity, sku, reference_id, from_box_id, note, created_at)
    SELECT 
        'MISCELLANEOUS_ISSUE',
        'ITEM',
        -i.quantity,
        p.sku,
        p_order_id,
        i.box_id,
        'Xuất bán đơn hàng: ' || v_order.code,
        NOW()
    FROM inventory_items i
    JOIN products p ON i.product_id = p.id
    WHERE i.box_id = ANY(v_box_ids);

    GET DIAGNOSTICS v_tx_count = ROW_COUNT;

    -- 4. Delete Inventory
    DELETE FROM inventory_items WHERE box_id = ANY(v_box_ids);

    -- 5. Update Order Status
    UPDATE orders SET status = 'SHIPPED', shipped_at = NOW() WHERE id = p_order_id;

    -- 6. Update Box Status
    UPDATE boxes SET status = 'SHIPPED' WHERE id = ANY(v_box_ids);

    -- 7. Close Picking Jobs
    UPDATE picking_jobs SET status = 'COMPLETED' WHERE order_id = p_order_id AND status != 'COMPLETED';

    RETURN jsonb_build_object('success', true, 'message', 'Đã xuất hàng thành công', 'tx_count', v_tx_count);

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- Function to Ship a Manual Job Atomically
CREATE OR REPLACE FUNCTION ship_manual_job(p_job_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_job RECORD;
    v_outbox_codes TEXT[];
    v_box_ids UUID[];
    v_tx_count INT := 0;
BEGIN
    -- 1. Verify Job
    SELECT * INTO v_job FROM picking_jobs WHERE id = p_job_id FOR UPDATE;

    IF v_job IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Không tìm thấy Job');
    END IF;

    -- Custom Check: If Completed, check if it actually has transactions
    IF v_job.status IN ('COMPLETED', 'SHIPPED') THEN
        PERFORM 1 FROM transactions WHERE reference_id = p_job_id LIMIT 1;
        IF FOUND THEN
            RETURN jsonb_build_object('success', false, 'error', 'Job này đã hoàn thành và đã trừ kho rồi.');
        END IF;
        -- If NOT FOUND, it means it was marked Completed but NO transactions (Bug). Allow to proceed.
    END IF;

    -- 2. Find Outboxes used in this job
    -- tasks -> outbox_code -> boxes.id
    SELECT array_agg(DISTINCT b.id) INTO v_box_ids
    FROM picking_tasks t
    JOIN boxes b ON b.code = t.outbox_code
    WHERE t.job_id = p_job_id AND b.type = 'OUTBOX';

    IF v_box_ids IS NOT NULL AND array_length(v_box_ids, 1) > 0 THEN
        -- 3. Transactions
        INSERT INTO transactions (type, entity_type, quantity, sku, reference_id, from_box_id, note, created_at)
        SELECT 
            'MISCELLANEOUS_ISSUE',
            'ITEM',
            -i.quantity,
            p.sku,
            p_job_id,
            i.box_id,
            'Xuất kho Manual Job: ' || v_job.id,
            NOW()
        FROM inventory_items i
        JOIN products p ON i.product_id = p.id
        WHERE i.box_id = ANY(v_box_ids);

        GET DIAGNOSTICS v_tx_count = ROW_COUNT;

        -- 4. Delete Inventory
        DELETE FROM inventory_items WHERE box_id = ANY(v_box_ids);

        -- 5. Update Boxes
        UPDATE boxes SET status = 'SHIPPED' WHERE id = ANY(v_box_ids);
    END IF;

    -- 6. Update Job
    UPDATE picking_jobs SET status = 'COMPLETED' WHERE id = p_job_id;

    RETURN jsonb_build_object('success', true, 'message', 'Xuất kho thành công', 'tx_count', v_tx_count);

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;
