-- Migration: Fix ship_manual_job "outbound_order_id column does not exist" error
-- Description: Redefines ship_manual_job to strictly reference valid columns.

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

    -- Generate Code
    -- Assuming generate_pxk_code() exists, if not use fallback
    BEGIN
        v_pxk_code := generate_pxk_code();
    EXCEPTION WHEN OTHERS THEN
        v_pxk_code := 'PXK-' || to_char(NOW(), 'YYMMDD') || '-' || substring(p_job_id::text, 1, 4);
    END;

    -- Create Shipment
    -- DO NOT Reference outbound_order_id here since it's a Manual Job
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

    -- Get Boxes
    SELECT array_agg(DISTINCT b.id) INTO v_box_ids
    FROM picking_tasks t
    JOIN boxes b ON b.code = t.outbox_code
    WHERE t.job_id = p_job_id AND b.type = 'OUTBOX';

    IF v_box_ids IS NOT NULL THEN
        -- Link Outboxes to Shipment via Transaction logging
        INSERT INTO transactions (type, entity_type, quantity, sku, reference_id, from_box_id, user_id, note, created_at)
        SELECT 'MISCELLANEOUS_ISSUE', 'ITEM', -i.quantity, p.sku, v_shipment_id, i.box_id, auth.uid(), 'Xuất Job ' || v_pxk_code, NOW()
        FROM inventory_items i 
        JOIN products p ON i.product_id = p.id 
        WHERE i.box_id = ANY(v_box_ids);
        
        -- Delete items
        DELETE FROM inventory_items WHERE box_id = ANY(v_box_ids);
        
        -- Update Boxes
        UPDATE boxes SET status = 'SHIPPED' WHERE id = ANY(v_box_ids);
    END IF;

    UPDATE picking_jobs SET status = 'SHIPPED', completed_at = NOW() WHERE id = p_job_id;

    RETURN jsonb_build_object('success', true, 'message', 'Xuất kho thành công: ' || v_pxk_code);
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;
