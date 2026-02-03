
CREATE OR REPLACE FUNCTION create_picking_job_v2(
    p_order_id UUID,
    p_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_order_status TEXT;
    v_job_id UUID;
    v_tasks_created INT := 0;
    v_order_record RECORD;
BEGIN
    -- 1. Validate Order
    SELECT * INTO v_order_record FROM outbound_orders WHERE id = p_order_id;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Không tìm thấy đơn hàng');
    END IF;

    -- Update: Allow creating job if status is ALLOCATED (standard) OR PENDING (if forcing manual job creation flow)
    IF v_order_record.status NOT IN ('ALLOCATED', 'PENDING') THEN
         RETURN jsonb_build_object('success', false, 'error', 'Đơn hàng chưa được phân bổ hoặc đã có Job');
    END IF;

    -- Check if Job exists already
    PERFORM 1 FROM picking_jobs WHERE outbound_order_id = p_order_id AND status != 'CANCELLED';
    IF FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Đơn hàng đã có Job đang chạy');
    END IF;

    -- 2. Create Job Header (Force status OPEN instead of PENDING)
    INSERT INTO picking_jobs (
        code,
        outbound_order_id,
        created_by,
        status, -- Changed from PENDING to OPEN
        type,
        zone
    ) VALUES (
        'JOB-' || substr(v_order_record.code, 5), -- Simple code gen
        p_order_id,
        p_user_id, -- Creator
        'OPEN', -- <--- CRITICAL CHANGE HERE
        CASE WHEN v_order_record.transfer_type = 'BOX' THEN 'BOX_PICK' ELSE 'MANUAL_PICK' END,
        'Z1' -- Default Zone for now
    ) RETURNING id INTO v_job_id;

    -- 3. Create Tasks from Allocation (if any)
    -- This assumes we have an allocation logic. If simplistic, we copy from order items.
    -- For now, let's assume we copy order items as tasks (One-to-one mapping simplified)
    
    INSERT INTO picking_tasks (
        job_id,
        product_id,
        quantity,
        box_id, -- If allocated
        location_id, -- If allocated
        status
    )
    SELECT 
        v_job_id,
        product_id,
        quantity, -- Need allocated quantity logic here ideally
        NULL, -- Placeholder if not fully allocated yet
        NULL,
        'PENDING'
    FROM outbound_order_items
    WHERE order_id = p_order_id;
    
    GET DIAGNOSTICS v_tasks_created = ROW_COUNT;

    -- 4. Update Order Status
    UPDATE outbound_orders 
    SET status = 'READY' -- Compatible with 'OPEN' job
    WHERE id = p_order_id;

    RETURN jsonb_build_object('success', true, 'job_id', v_job_id, 'tasks', v_tasks_created);
END;
$$;
