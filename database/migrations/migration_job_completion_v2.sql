    -- Migration: Job Completion Automation
    -- Description: Standardizes job completion, moves boxes to GATE-OUT, and creates shipments (PXK).

    -- 1. Helper Function to generate PXK code (if not already exists)
    CREATE OR REPLACE FUNCTION generate_pxk_code()
    RETURNS TEXT
    LANGUAGE plpgsql
    AS $$
    DECLARE
        v_date_str TEXT;
        v_seq INT;
        v_code TEXT;
    BEGIN
        v_date_str := to_char(NOW(), 'YYMMDD');
        CREATE SEQUENCE IF NOT EXISTS seq_pxk_code;
        v_seq := nextval('seq_pxk_code');
        v_code := 'PXK-' || v_date_str || '-' || lpad(v_seq::text, 4, '0');
        RETURN v_code;
    END;
    $$;

    -- 2. Core RPC: complete_picking_job
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
        v_pending_count INT;
        v_gate_out_id UUID;
        v_pxk_code TEXT;
        v_shipment_id UUID;
        v_item_count INT;
        v_source_type TEXT;
        v_order_code TEXT;
    BEGIN
        -- 1. Get Job
        SELECT * INTO v_job FROM picking_jobs WHERE id = p_job_id FOR UPDATE;
        IF v_job IS NULL THEN
            RETURN jsonb_build_object('success', false, 'error', 'Không tìm thấy Job');
        END IF;

        -- 2. Verify all tasks are COMPLETED
        SELECT count(*), count(*) FILTER (WHERE status != 'COMPLETED') 
        INTO v_task_count, v_pending_count 
        FROM picking_tasks WHERE job_id = p_job_id;

        IF v_task_count = 0 THEN
            RETURN jsonb_build_object('success', false, 'error', 'Job không có nhiệm vụ nào');
        END IF;

        IF v_pending_count > 0 THEN
            RETURN jsonb_build_object('success', false, 'error', 'Còn ' || v_pending_count || ' món hàng chưa nhặt xong');
        END IF;

        -- 3. Get Locations
        SELECT id INTO v_gate_out_id FROM locations WHERE code = 'GATE-OUT' LIMIT 1;
        IF v_gate_out_id IS NULL THEN
            RETURN jsonb_build_object('success', false, 'error', 'Vị trí GATE-OUT chưa được thiết lập');
        END IF;

        -- 4. Move related Boxes to GATE-OUT
        -- For ITEM_PICK: move the OUTBOXES
        IF v_job.type = 'ITEM_PICK' THEN
            UPDATE boxes SET location_id = v_gate_out_id, updated_at = NOW()
            WHERE id IN (SELECT DISTINCT outbox_id FROM picking_tasks WHERE job_id = p_job_id AND outbox_id IS NOT NULL);
        -- For BOX_PICK: move the source boxes (already handled in confirm_box_pick, but for safety...)
        ELSE
            UPDATE boxes SET location_id = v_gate_out_id, updated_at = NOW()
            WHERE id IN (SELECT DISTINCT box_id FROM picking_tasks WHERE job_id = p_job_id);
        END IF;

        -- 5. Create Outbound Shipment (PXK)
        -- Determine source type and metadata
        SELECT 
            CASE 
                WHEN type = 'SALE' THEN 'ORDER'
                WHEN type IN ('TRANSFER', 'INTERNAL') THEN 'TRANSFER'
                ELSE 'MANUAL_JOB'
            END,
            COALESCE(code, 'UNKNOWN')
        INTO v_source_type, v_order_code
        FROM outbound_orders WHERE id = v_job.outbound_order_id;

        v_pxk_code := generate_pxk_code();
        
        -- Sum item quantity
        SELECT SUM(quantity) INTO v_item_count FROM picking_tasks WHERE job_id = p_job_id;

        INSERT INTO outbound_shipments (code, source_type, source_id, created_by, metadata)
        VALUES (
            v_pxk_code,
            v_source_type,
            COALESCE(v_job.outbound_order_id, p_job_id),
            p_user_id,
            jsonb_build_object(
                'original_code', v_order_code,
                'item_count', v_item_count,
                'job_id', p_job_id
            )
        )
        RETURNING id INTO v_shipment_id;

        -- 6. Update Job Status
        UPDATE picking_jobs 
        SET status = 'COMPLETED',
            completed_at = NOW()
        WHERE id = p_job_id;

        -- 7. Update Order Status to PACKED
        IF v_job.outbound_order_id IS NOT NULL THEN
            UPDATE outbound_orders 
            SET status = 'PACKED', updated_at = NOW() 
            WHERE id = v_job.outbound_order_id AND status != 'CANCELLED';
        END IF;

        RETURN jsonb_build_object(
            'success', true, 
            'pxk_code', v_pxk_code, 
            'shipment_id', v_shipment_id,
            'message', 'Hoàn thành Job và tạo phiếu xuất ' || v_pxk_code
        );
    END;
    $$;

    -- 3. Data Correction: Fix already completed jobs
    DO $$
    DECLARE
        v_job RECORD;
        v_res JSONB;
    BEGIN
        FOR v_job IN 
            SELECT id FROM picking_jobs 
            WHERE status = 'COMPLETED' 
            AND id NOT IN (SELECT (metadata->>'job_id')::UUID FROM outbound_shipments WHERE metadata->>'job_id' IS NOT NULL)
        LOOP
            -- Note: We skip user_id as v_job doesn't have it easily available here, using NULL is fine as per SECURITY DEFINER
            -- But we only run this for jobs that are actually 100% done
            v_res := complete_picking_job(v_job.id, NULL);
        END LOOP;
    END $$;
