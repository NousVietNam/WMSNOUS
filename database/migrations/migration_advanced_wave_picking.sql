
-- =====================================================
-- Migration: Advanced Wave Picking Support
-- Description: 1. Add 'WAVE_PICK' type to picking_jobs
--              2. Prepare for Multi-Job Wave Release
-- =====================================================

DO $$
BEGIN
    -- Update Job Type Constraint
    ALTER TABLE picking_jobs DROP CONSTRAINT IF EXISTS picking_jobs_type_check;
    ALTER TABLE picking_jobs ADD CONSTRAINT picking_jobs_type_check 
    CHECK (type IN ('ITEM_PICK', 'BOX_PICK', 'WAVE_PICK'));
END $$;

-- Update Release Wave to use WAVE_PICK type
CREATE OR REPLACE FUNCTION release_wave(
    p_wave_id UUID,
    p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_wave RECORD;
    v_order RECORD;
    v_item RECORD;
    v_inv RECORD;
    v_job_id UUID;
    v_job_code TEXT;
    v_remaining INT;
    v_take INT;
    v_order_count INT := 0;
    v_task_count INT := 0;
BEGIN
    -- A. Validate Wave
    SELECT * INTO v_wave FROM pick_waves WHERE id = p_wave_id;
    IF v_wave IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Wave not found');
    END IF;

    IF v_wave.status != 'PLANNING' THEN
         RETURN jsonb_build_object('success', false, 'error', 'Trạng thái Wave không hợp lệ');
    END IF;

    -- B. logic Tương lai: Group theo Zone để tạo nhiều Job ở đây
    -- Hiện tại: Tạo 01 Master Job loại WAVE_PICK
    v_job_code := 'WAVE-JOB-' || v_wave.code;
    
    INSERT INTO picking_jobs (code, wave_id, type, status, created_at)
    VALUES (v_job_code, p_wave_id, 'WAVE_PICK', 'OPEN', NOW())
    RETURNING id INTO v_job_id;

    -- C. Phân bổ hàng và tạo Tasks
    FOR v_order IN SELECT id, code FROM outbound_orders WHERE wave_id = p_wave_id
    LOOP
        v_order_count := v_order_count + 1;
        
        FOR v_item IN 
            SELECT ooi.id, ooi.product_id, ooi.quantity, p.sku
            FROM outbound_order_items ooi
            JOIN products p ON ooi.product_id = p.id
            WHERE ooi.order_id = v_order.id
        LOOP
            v_remaining := v_item.quantity;
            
            -- Ưu tiên nhặt từ Bulk (Phù hợp với Wave Wholesale)
            FOR v_inv IN 
                SELECT id, box_id, quantity, COALESCE(allocated_quantity, 0) as allocated
                FROM bulk_inventory
                WHERE product_id = v_item.product_id
                  AND (quantity - COALESCE(allocated_quantity, 0)) > 0
                ORDER BY created_at ASC
                FOR UPDATE
            LOOP
                IF v_remaining <= 0 THEN EXIT; END IF;
                
                v_take := LEAST(v_inv.quantity - v_inv.allocated, v_remaining);
                
                IF v_take > 0 THEN
                    INSERT INTO picking_tasks (
                        job_id, order_item_id, product_id, box_id, quantity, status, created_at
                    )
                    VALUES (
                        v_job_id, v_item.id, v_item.product_id, v_inv.box_id, v_take, 'PENDING', NOW()
                    );
                    
                    v_task_count := v_task_count + 1;

                    UPDATE bulk_inventory SET allocated_quantity = COALESCE(allocated_quantity, 0) + v_take WHERE id = v_inv.id;
                    
                    INSERT INTO transactions (type, entity_type, sku, quantity, reference_id, from_box_id, user_id, note, created_at)
                    VALUES ('RESERVE', 'ITEM', v_item.sku, v_take, v_order.id, v_inv.box_id, p_user_id, 'Phân bổ Wave ' || v_wave.code, NOW());

                    v_remaining := v_remaining - v_take;
                END IF;
            END LOOP;

            IF v_remaining > 0 THEN
                RAISE EXCEPTION 'Thiếu hàng cho SKU % trong đơn % (Còn thiếu: %)', v_item.sku, v_order.code, v_remaining;
            END IF;
        END LOOP;

        UPDATE outbound_orders SET status = 'ALLOCATED' WHERE id = v_order.id;
    END LOOP;

    -- D. Cập nhật Wave
    UPDATE pick_waves SET status = 'RELEASED', released_at = NOW() WHERE id = p_wave_id;

    RETURN jsonb_build_object(
        'success', true, 
        'message', 'Duyệt Wave thành công (Quy trình WAVE_PICK)', 
        'job_id', v_job_id,
        'orders', v_order_count,
        'tasks', v_task_count
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;
