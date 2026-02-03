
-- Migration: Fine-tuned Order Status Transition
-- Description: WAVE_PICK jobs will NO LONGER automatically set order to PACKED. 
-- PACKED status for Wave orders must be confirmed at the Sorting Table.
-- Normal ITEM_PICK/BOX_PICK jobs will still auto-transition to PACKED.

CREATE OR REPLACE FUNCTION complete_picking_job(
    p_job_id UUID,
    p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_job RECORD;
    v_task_count INT;
    v_pending_tasks INT;
    v_gate_out_id UUID;
    v_order_id UUID;
    v_order_ids UUID[];
    v_remaining_jobs INT;
    v_pxk_code TEXT;
    v_shipment_id UUID;
    v_item_count INT;
    v_source_type TEXT;
    v_order_code TEXT;
    v_has_wave_job BOOLEAN;
BEGIN
    -- 1. Get Job Info
    SELECT * INTO v_job FROM picking_jobs WHERE id = p_job_id FOR UPDATE;
    IF v_job IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Job not found');
    END IF;

    -- 2. Validation
    SELECT count(*), count(*) FILTER (WHERE status != 'COMPLETED') 
    INTO v_task_count, v_pending_tasks 
    FROM picking_tasks WHERE job_id = p_job_id;

    IF v_task_count = 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Job has no tasks');
    END IF;

    IF v_pending_tasks > 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Still has ' || v_pending_tasks || ' pending tasks');
    END IF;

    -- 3. Mark Job COMPLETE
    UPDATE picking_jobs 
    SET status = 'COMPLETED', completed_at = NOW()
    WHERE id = p_job_id;

    -- 4. Move Boxes to GATE-OUT (Sorting Area)
    SELECT id INTO v_gate_out_id FROM locations WHERE code = 'GATE-OUT' LIMIT 1;
    IF v_gate_out_id IS NOT NULL THEN
        IF v_job.type = 'ITEM_PICK' OR v_job.type = 'WAVE_PICK' THEN
            UPDATE boxes SET location_id = v_gate_out_id, updated_at = NOW()
            WHERE id IN (SELECT DISTINCT outbox_id FROM picking_tasks WHERE job_id = p_job_id AND outbox_id IS NOT NULL);
        ELSE
            UPDATE boxes SET location_id = v_gate_out_id, updated_at = NOW()
            WHERE id IN (SELECT DISTINCT box_id FROM picking_tasks WHERE job_id = p_job_id);
        END IF;
    END IF;

    -- 5. Identify affected Orders
    SELECT array_agg(DISTINCT ooi.order_id) INTO v_order_ids
    FROM picking_tasks pt
    JOIN outbound_order_items ooi ON pt.order_item_id = ooi.id
    WHERE pt.job_id = p_job_id;

    -- 6. Synchronize Order Status
    IF v_order_ids IS NOT NULL THEN
        FOREACH v_order_id IN ARRAY v_order_ids
        LOOP
            -- Check if any jobs for this order are still pending (including other Zones)
            SELECT COUNT(*) INTO v_remaining_jobs
            FROM picking_jobs pj
            JOIN picking_tasks pt ON pj.id = pt.job_id
            JOIN outbound_order_items ooi ON pt.order_item_id = ooi.id
            WHERE ooi.order_id = v_order_id
            AND pj.status NOT IN ('COMPLETED', 'CANCELLED');

            IF v_remaining_jobs = 0 THEN
                -- Check if this order involved any WAVE_PICK jobs
                SELECT EXISTS (
                    SELECT 1 FROM picking_jobs pj
                    JOIN picking_tasks pt ON pj.id = pt.job_id
                    JOIN outbound_order_items ooi ON pt.order_item_id = ooi.id
                    WHERE ooi.order_id = v_order_id AND pj.type = 'WAVE_PICK'
                ) INTO v_has_wave_job;

                -- Logic: WAVE orders need manual packing confirmation at sorting desk
                -- Normal orders (ITEM/BOX) auto-transition to PACKED
                IF NOT v_has_wave_job THEN
                    -- A. Mark as PACKED
                    UPDATE outbound_orders 
                    SET status = 'PACKED', updated_at = NOW() 
                    WHERE id = v_order_id AND status != 'CANCELLED';

                    -- B. Create Shipment
                    SELECT 
                        CASE WHEN type = 'SALE' THEN 'ORDER' ELSE 'TRANSFER' END,
                        COALESCE(code, 'UNKNOWN')
                    INTO v_source_type, v_order_code
                    FROM outbound_orders WHERE id = v_order_id;

                    v_pxk_code := generate_pxk_code();
                    
                    SELECT SUM(quantity) INTO v_item_count 
                    FROM picking_tasks pt 
                    JOIN outbound_order_items ooi ON pt.order_item_id = ooi.id
                    WHERE ooi.order_id = v_order_id;

                    INSERT INTO outbound_shipments (code, source_type, source_id, created_by, metadata)
                    VALUES (
                        v_pxk_code, v_source_type, v_order_id, p_user_id,
                        jsonb_build_object('order_code', v_order_code, 'item_count', v_item_count, 'trigger_job_id', p_job_id)
                    );
                END IF;
            END IF;
        END LOOP;
    END IF;

    RETURN jsonb_build_object('success', true, 'message', 'Job completed. Order status updated based on job type.');
END;
$$;
