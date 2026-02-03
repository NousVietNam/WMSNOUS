
-- Migration: Fix Allocation Release on Wave/Job Cancellation
-- Description: Adds a trigger to release allocated_quantity when picking_tasks are deleted.

-- 1. Create the Trigger Function
CREATE OR REPLACE FUNCTION trigger_release_allocation_on_task_delete()
RETURNS TRIGGER AS $$
DECLARE
    v_inv_type TEXT;
BEGIN
    -- Tìm loại kho của Wave thông qua Job
    SELECT pw.inventory_type INTO v_inv_type
    FROM picking_jobs pj
    JOIN pick_waves pw ON pj.wave_id = pw.id
    WHERE pj.id = OLD.job_id;

    -- Nếu không thuộc Wave nào, mặc định thử kiểm tra cả 2 hoặc dựa trên Business logic hiện tại là Sỉ (Bulk)
    -- Tuy nhiên, nếu không có wave_id thì thường là Job lẻ, có thể không dùng allocated_quantity (tùy thiết kế)
    -- Để an toàn, chúng ta chỉ xử lý nếu tìm thấy Wave Type.
    
    IF v_inv_type = 'BULK' THEN
        UPDATE public.bulk_inventory 
        SET allocated_quantity = GREATEST(0, COALESCE(allocated_quantity, 0) - OLD.quantity)
        WHERE box_id = OLD.box_id AND product_id = OLD.product_id;
    ELSIF v_inv_type = 'PIECE' THEN
        UPDATE public.inventory_items 
        SET allocated_quantity = GREATEST(0, COALESCE(allocated_quantity, 0) - OLD.quantity)
        WHERE box_id = OLD.box_id AND product_id = OLD.product_id;
    END IF;

    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- 2. Attach Trigger to picking_tasks
DROP TRIGGER IF EXISTS trg_release_allocation_on_task_delete ON picking_tasks;
CREATE TRIGGER trg_release_allocation_on_task_delete
BEFORE DELETE ON picking_tasks
FOR EACH ROW
EXECUTE FUNCTION trigger_release_allocation_on_task_delete();

-- 3. Cập nhật cancel_wave để đảm bảo quy trình xóa sạch sẽ
-- (Đã có trong migration_cancel_released_wave.sql nhưng ta bổ sung thêm log)
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

    -- Kiểm tra xem có Job nào đã bắt đầu nhặt chưa
    SELECT COUNT(*) INTO v_started_jobs 
    FROM picking_jobs 
    WHERE wave_id = p_wave_id 
    AND status IN ('IN_PROGRESS', 'COMPLETED');
    
    IF v_started_jobs > 0 THEN
         RETURN jsonb_build_object('success', false, 'error', 'Không thể hủy vì có ' || v_started_jobs || ' lệnh nhặt đang thực hiện/hoàn tất.');
    END IF;

    -- Xóa các Picking Jobs (Trigger trên picking_tasks sẽ tự giải phóng allocation)
    DELETE FROM picking_jobs WHERE wave_id = p_wave_id;

    -- Trả đơn về trạng thái PENDING và tách khỏi Wave
    UPDATE outbound_orders
    SET wave_id = NULL,
        status = 'PENDING'
    WHERE wave_id = p_wave_id;

    -- Đánh dấu Wave đã hủy
    UPDATE pick_waves
    SET status = 'CANCELLED',
        total_orders = 0,
        total_items = 0,
        description = COALESCE(description, '') || ' [Cancelled: ' || p_reason || ']'
    WHERE id = p_wave_id;

    RETURN jsonb_build_object('success', true, 'message', 'Đã hủy Wave và giải phóng tồn kho phân bổ thành công.');
END;
$$;
