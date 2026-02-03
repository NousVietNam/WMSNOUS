
-- Migration: Smart Multi-Order Status Transition (Wave Awareness)
-- Description: Updates specific Orders to PACKED ONLY when ALL their jobs across ALL zones are completed.
-- Handles mixed Wave Pick jobs.

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
    v_order_ids UUID[]; -- Danh sách các đơn hàng có trong Job này
    v_remaining_jobs INT;
    v_pxk_code TEXT;
    v_shipment_id UUID;
    v_item_count INT;
    v_source_type TEXT;
    v_order_code TEXT;
BEGIN
    -- 1. Lấy thông tin Job
    SELECT * INTO v_job FROM picking_jobs WHERE id = p_job_id FOR UPDATE;
    IF v_job IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Không tìm thấy Job');
    END IF;

    -- 2. Kiểm tra task hiện tại trong Job
    SELECT count(*), count(*) FILTER (WHERE status != 'COMPLETED') 
    INTO v_task_count, v_pending_tasks 
    FROM picking_tasks WHERE job_id = p_job_id;

    IF v_task_count = 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Job không có nhiệm vụ nào');
    END IF;

    IF v_pending_tasks > 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Còn ' || v_pending_tasks || ' món hàng trong Job này chưa nhặt xong');
    END IF;

    -- 3. Đánh dấu Job HOÀN TẤT
    UPDATE picking_jobs 
    SET status = 'COMPLETED', completed_at = NOW()
    WHERE id = p_job_id;

    -- 4. Di dời Hàng/Hộp ra GATE-OUT
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

    -- 5. Lọc danh sách Đơn hàng bị ảnh hưởng bởi Job này (Hỗ trợ Wave trộn nhiều đơn)
    SELECT array_agg(DISTINCT ooi.order_id) INTO v_order_ids
    FROM picking_tasks pt
    JOIN outbound_order_items ooi ON pt.order_item_id = ooi.id
    WHERE pt.job_id = p_job_id;

    -- 6. Duyệt từng Đơn hàng để check trạng thái tổng thể
    IF v_order_ids IS NOT NULL THEN
        FOREACH v_order_id IN ARRAY v_order_ids
        LOOP
            -- Kiểm tra xem Đơn hàng này còn Job nào khác CHƯA XONG không (trong toàn bộ Wave hoặc Single)
            SELECT COUNT(*) INTO v_remaining_jobs
            FROM picking_jobs pj
            JOIN picking_tasks pt ON pj.id = pt.job_id
            JOIN outbound_order_items ooi ON pt.order_item_id = ooi.id
            WHERE ooi.order_id = v_order_id
            AND pj.status NOT IN ('COMPLETED', 'CANCELLED');

            -- Nếu đơn này KHÔNG còn Job nào đang chờ (tất cả các Zone đã nhặt xong đơn này)
            IF v_remaining_jobs = 0 THEN
                -- A. Chốt Trạng thái sang PACKED
                UPDATE outbound_orders 
                SET status = 'PACKED', updated_at = NOW() 
                WHERE id = v_order_id AND status != 'CANCELLED';

                -- B. Tạo Phiếu Xuất Kho (Tự động hóa luồng Ship)
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
        END LOOP;
    END IF;

    RETURN jsonb_build_object('success', true, 'message', 'Job completed and order statuses synchronized.');
END;
$$;
