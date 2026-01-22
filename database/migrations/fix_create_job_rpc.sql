-- Fix for "column ooi.box_id does not exist" error in create_picking_job_for_outbound
-- This RPC replaces the legacy/broken version that was trying to access non-existent columns.
-- It assumes allocate_outbound has already created a PLANNED job.

CREATE OR REPLACE FUNCTION create_picking_job_for_outbound(p_order_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_job_id UUID;
    v_status TEXT;
BEGIN
    -- 1. Check Order Status
    SELECT status INTO v_status FROM outbound_orders WHERE id = p_order_id;
    IF v_status != 'ALLOCATED' AND v_status != 'IDLE' THEN -- Allow IDLE if that's a valid pre-state, typically ALLOCATED
         -- Just a warning, proceed to check job
    END IF;

    -- 2. Try to find existing PLANNED job (Created by allocate_outbound)
    SELECT id INTO v_job_id FROM picking_jobs 
    WHERE outbound_order_id = p_order_id AND status = 'PLANNED'
    LIMIT 1;
    
    IF v_job_id IS NOT NULL THEN
        -- Activate the job
        UPDATE picking_jobs SET status = 'OPEN', started_at = NOW() WHERE id = v_job_id;
        RETURN jsonb_build_object('success', true, 'job_id', v_job_id, 'message', 'Đã kích hoạt job');
    END IF;

    -- 3. Check if already OPEN or other active status
    SELECT id INTO v_job_id FROM picking_jobs 
    WHERE outbound_order_id = p_order_id AND status NOT IN ('CANCELLED', 'PLANNED')
    LIMIT 1;

    IF v_job_id IS NOT NULL THEN
         RETURN jsonb_build_object('success', true, 'message', 'Job đã tồn tại và đang mở', 'job_id', v_job_id);
    END IF;

    -- 4. If no job exists but Order is ALLOCATED, maybe it was deleted?
    -- Return clear error asking to Re-Allocate
    RETURN jsonb_build_object('success', false, 'error', 'Không tìm thấy job dự kiến (PLANNED). Vui lòng thử Phân bổ lại đơn hàng.');
END;
$$;
