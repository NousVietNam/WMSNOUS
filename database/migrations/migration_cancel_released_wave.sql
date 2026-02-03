
-- Enhanced Cancel Wave Function to support peeling back Released Waves
-- Condition: Can only cancel if NO Picking Jobs have been started/completed.

CREATE OR REPLACE FUNCTION cancel_wave(
    p_wave_id UUID,
    p_reason TEXT DEFAULT 'Cancelled by user'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_status TEXT;
    v_job_count INT;
    v_started_jobs INT;
BEGIN
    -- 1. Check Wave Status
    SELECT status INTO v_status FROM pick_waves WHERE id = p_wave_id;
    
    IF v_status = 'CANCELLED' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Wave is already cancelled');
    END IF;
    
    IF v_status = 'COMPLETED' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Cannot cancel a COMPLETED wave');
    END IF;

    -- 2. If Wave is RELEASED (or PARTIAL), check for active jobs
    IF v_status = 'RELEASED' OR v_status = 'IN_PROGRESS' THEN
        -- Check if any job is done or in progress
        SELECT COUNT(*) INTO v_started_jobs 
        FROM picking_jobs 
        WHERE wave_id = p_wave_id 
        AND status IN ('IN_PROGRESS', 'COMPLETED');
        
        IF v_started_jobs > 0 THEN
             RETURN jsonb_build_object('success', false, 'error', 'Cannot cancel Wave because some Picking Jobs have already started. Please return items first.');
        END IF;

        -- Safe to delete jobs because none are started
        DELETE FROM picking_jobs WHERE wave_id = p_wave_id;
    END IF;

    -- 3. Reset Orders
    -- Remove them from this wave? Or just keep them linked but Cancelled?
    -- Usually we want to unlink them so they can be planned into another wave.
    UPDATE outbound_orders
    SET wave_id = NULL,
        status = 'PENDING' -- Return to pool
    WHERE wave_id = p_wave_id;

    -- 4. Set Wave Status
    UPDATE pick_waves
    SET status = 'CANCELLED',
        description = COALESCE(description, '') || ' [Cancelled: ' || p_reason || ']'
    WHERE id = p_wave_id;

    -- 5. Recalc Metrics (Should become 0)
    -- Trigger handling...

    RETURN jsonb_build_object('success', true, 'message', 'Wave cancelled and orders returned to pool.');
END;
$$;
