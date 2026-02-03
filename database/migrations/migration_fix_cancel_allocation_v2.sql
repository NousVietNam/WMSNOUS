
-- Migration: Fix Cancel Wave Allocation Release Logic
-- 1. Improve Trigger to be robust against Cascade Delete (Parent gone)
-- 2. Update cancel_wave to delete Tasks FIRST (Best Practice)

-- Part 1: Robust Trigger
CREATE OR REPLACE FUNCTION trigger_release_allocation_on_task_delete()
RETURNS TRIGGER AS $$
DECLARE
    v_inv_type TEXT;
    v_rows_updated INT;
BEGIN
    -- 1. Try to determine type from Parent Job
    BEGIN
        SELECT pw.inventory_type INTO v_inv_type
        FROM picking_jobs pj
        JOIN pick_waves pw ON pj.wave_id = pw.id
        WHERE pj.id = OLD.job_id;
    EXCEPTION WHEN OTHERS THEN
        v_inv_type := NULL;
    END;

    -- 2. Release Allocation
    IF v_inv_type = 'BULK' THEN
        UPDATE public.bulk_inventory 
        SET allocated_quantity = GREATEST(0, COALESCE(allocated_quantity, 0) - OLD.quantity)
        WHERE box_id = OLD.box_id AND product_id = OLD.product_id;
    ELSIF v_inv_type = 'PIECE' THEN -- Piece or Box Pick
        UPDATE public.inventory_items 
        SET allocated_quantity = GREATEST(0, COALESCE(allocated_quantity, 0) - OLD.quantity)
        WHERE box_id = OLD.box_id AND product_id = OLD.product_id;
    ELSE
        -- Fallback: Parent Job might be gone (Cascade). Try Bulk first.
        UPDATE public.bulk_inventory 
        SET allocated_quantity = GREATEST(0, COALESCE(allocated_quantity, 0) - OLD.quantity)
        WHERE box_id = OLD.box_id AND product_id = OLD.product_id;
        
        GET DIAGNOSTICS v_rows_updated = ROW_COUNT;
        
        IF v_rows_updated = 0 THEN
            -- If not bulk, try Piece
            UPDATE public.inventory_items 
            SET allocated_quantity = GREATEST(0, COALESCE(allocated_quantity, 0) - OLD.quantity)
            WHERE box_id = OLD.box_id AND product_id = OLD.product_id;
        END IF;
    END IF;

    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- Re-bind trigger (Safety)
DROP TRIGGER IF EXISTS trg_release_allocation_on_task_delete ON picking_tasks;
CREATE TRIGGER trg_release_allocation_on_task_delete
BEFORE DELETE ON picking_tasks
FOR EACH ROW
EXECUTE FUNCTION trigger_release_allocation_on_task_delete();


-- Part 2: Update Cancel Wave to Delete Tasks Explicitly
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
    v_started_jobs INT;
BEGIN
    SELECT status INTO v_status FROM pick_waves WHERE id = p_wave_id;
    
    IF v_status = 'CANCELLED' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Wave đã được hủy trước đó');
    END IF;
    
    IF v_status = 'COMPLETED' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Không thể hủy Wave đã hoàn thành');
    END IF;

    -- Check for jobs in progress
    SELECT COUNT(*) INTO v_started_jobs 
    FROM picking_jobs 
    WHERE wave_id = p_wave_id 
    AND status IN ('IN_PROGRESS', 'COMPLETED', 'PICKING', 'PACKED');
    
    IF v_started_jobs > 0 THEN
         RETURN jsonb_build_object('success', false, 'error', 'Không thể hủy vì có ' || v_started_jobs || ' lệnh nhặt đang thực hiện/hoàn tất.');
    END IF;

    -- 1. Explicitly Delete Tasks FIRST 
    -- This ensures the Trigger finds the Job/Wave info before they are deleted
    DELETE FROM picking_tasks 
    WHERE job_id IN (SELECT id FROM picking_jobs WHERE wave_id = p_wave_id);

    -- 2. Delete Jobs
    DELETE FROM picking_jobs WHERE wave_id = p_wave_id;

    -- 3. Reset Orders
    UPDATE outbound_orders
    SET wave_id = NULL,
        status = 'PENDING'
    WHERE wave_id = p_wave_id;

    -- 4. Mark Wave Cancelled
    UPDATE pick_waves
    SET status = 'CANCELLED',
        total_orders = 0,
        total_items = 0,
        description = COALESCE(description, '') || ' [Cancelled: ' || p_reason || ']'
    WHERE id = p_wave_id;

    RETURN jsonb_build_object('success', true, 'message', 'Đã hủy Wave và giải phóng tồn kho phân bổ thành công.');
END;
$$;
