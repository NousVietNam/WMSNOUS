-- Migration: Fix Box Pick Flow & Location Clearing
-- Description: 
-- 1. Updates confirm_box_pick to link the Box to the Outbound Order (Critical for ship_outbound_order).
-- 2. Updates ship_manual_job to handle BOX_PICK (where outbox_id is NULL).

-- 1. Fix confirm_box_pick (To set outbound_order_id)
CREATE OR REPLACE FUNCTION confirm_box_pick(
    p_box_id UUID,
    p_job_id UUID,
    p_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_task RECORD;
    v_job RECORD;
    v_gate_out_id UUID;
    v_success_count INT := 0;
BEGIN
    SELECT * INTO v_job FROM picking_jobs WHERE id = p_job_id;
    IF v_job IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Không tìm thấy Job ID');
    END IF;

    SELECT id INTO v_gate_out_id FROM locations WHERE code = 'GATE-OUT' LIMIT 1;
    
    -- UPDATE BOX: Move to GATE-OUT AND Link to Order
    IF v_gate_out_id IS NOT NULL THEN
        UPDATE boxes 
        SET location_id = v_gate_out_id, 
            outbound_order_id = v_job.outbound_order_id, -- CRITICAL FIX
            updated_at = NOW() 
        WHERE id = p_box_id;
    END IF;

    FOR v_task IN 
        SELECT id, quantity, order_item_id FROM picking_tasks 
        WHERE job_id = p_job_id AND box_id = p_box_id AND status ILIKE 'PENDING' 
    LOOP
        UPDATE picking_tasks SET status = 'COMPLETED', picked_at = NOW(), picked_by = p_user_id WHERE id = v_task.id;

        UPDATE outbound_order_items SET picked_quantity = COALESCE(picked_quantity, 0) + v_task.quantity WHERE id = v_task.order_item_id;
        
        v_success_count := v_success_count + 1;
    END LOOP;

    IF v_job.outbound_order_id IS NOT NULL THEN
        UPDATE outbound_orders SET status = 'PICKING', updated_at = NOW() 
        WHERE id = v_job.outbound_order_id AND status IN ('ALLOCATED', 'READY');
    END IF;

    RETURN jsonb_build_object('success', true, 'processed', v_success_count, 'box_id', p_box_id);
END;
$$;

-- 2. Fix ship_manual_job (To find boxes correctly for BOX_PICK)
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
        v_pxk_code := 'PXK-MAN-' || substring(p_job_id::text, 1, 8);
    END;

    INSERT INTO outbound_shipments (
        code, source_type, source_id, created_by, metadata, picking_job_id, customer_name, note
    )
    VALUES (
        v_pxk_code, 'MANUAL_JOB', p_job_id, auth.uid(),
        jsonb_build_object('item_count', v_item_count, 'original_code', 'JOB-' || substring(p_job_id::text, 1, 8)),
        p_job_id, 'Xuất Thủ Công', 'Xuất từ Job ' || 'JOB-' || substring(p_job_id::text, 1, 8)
    )
    RETURNING id INTO v_shipment_id;

    -- FIX: Smart detection of shipped boxes
    -- If ITEM_PICK -> Use outbox_id
    -- If BOX_PICK -> Use box_id (Source box is the shipped box)
    SELECT array_agg(DISTINCT b.id) INTO v_box_ids
    FROM picking_tasks t
    JOIN boxes b ON (
        (t.outbox_id IS NOT NULL AND b.id = t.outbox_id) -- Case 1: Item Pick
        OR
        (t.outbox_id IS NULL AND b.id = t.box_id)        -- Case 2: Box Pick
    )
    WHERE t.job_id = p_job_id;

    IF v_box_ids IS NOT NULL THEN
        INSERT INTO transactions (type, entity_type, quantity, sku, reference_id, from_box_id, user_id, note, created_at)
        SELECT 'MISCELLANEOUS_ISSUE', 'ITEM', -i.quantity, p.sku, v_shipment_id, i.box_id, auth.uid(), 'Xuất Job ' || v_pxk_code, NOW()
        FROM inventory_items i JOIN products p ON i.product_id = p.id WHERE i.box_id = ANY(v_box_ids);
        
        DELETE FROM inventory_items WHERE box_id = ANY(v_box_ids);
        
        -- Clear Location
        UPDATE boxes SET status = 'SHIPPED', location_id = NULL WHERE id = ANY(v_box_ids);
    END IF;

    UPDATE picking_jobs SET status = 'SHIPPED', completed_at = NOW() WHERE id = p_job_id;

    RETURN jsonb_build_object('success', true, 'message', 'Xuất kho thành công: ' || v_pxk_code);
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;
