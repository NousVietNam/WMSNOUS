
-- =====================================================
-- Migration: Wave Zoning and Multi-user Support
-- Description: 1. Add zone support to locations and jobs
--              2. Enhance release_wave to split jobs by zone
-- =====================================================

-- 1. Schema Enhancements
DO $$
BEGIN
    -- Add zone to locations
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'locations' AND column_name = 'zone') THEN
        ALTER TABLE locations ADD COLUMN zone TEXT;
    END IF;

    -- Add zone to picking_jobs
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'picking_jobs' AND column_name = 'zone') THEN
        ALTER TABLE picking_jobs ADD COLUMN zone TEXT;
    END IF;
END $$;

-- 2. Enhanced Release Wave with Zoning Logic
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
    v_zone TEXT;
    v_order_count INT := 0;
    v_task_count INT := 0;
    v_job_count INT := 0;
BEGIN
    -- A. Validate Wave
    SELECT * INTO v_wave FROM pick_waves WHERE id = p_wave_id;
    IF v_wave IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Wave not found');
    END IF;

    IF v_wave.status != 'PLANNING' THEN
         RETURN jsonb_build_object('success', false, 'error', 'Trạng thái Wave không hợp lệ');
    END IF;

    -- B. Process Inventory and Create Tasks (In-memory grouping by Zone)
    -- We use a temp table to group tasks before creating jobs
    CREATE TEMP TABLE tmp_wave_tasks (
        order_item_id UUID,
        product_id UUID,
        box_id UUID,
        quantity INT,
        zone TEXT,
        order_id UUID,
        sku TEXT
    ) ON COMMIT DROP;

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
            
            -- Find Inventory in BULK_INVENTORY
            -- Join with locations to get Zone
            FOR v_inv IN 
                SELECT bi.id, bi.box_id, bi.quantity, COALESCE(bi.allocated_quantity, 0) as allocated, l.zone as loc_zone
                FROM bulk_inventory bi
                LEFT JOIN locations l ON bi.location_id = l.id
                WHERE bi.product_id = v_item.product_id
                  AND (bi.quantity - COALESCE(bi.allocated_quantity, 0)) > 0
                ORDER BY bi.created_at ASC
                FOR UPDATE
            LOOP
                IF v_remaining <= 0 THEN EXIT; END IF;
                
                v_take := LEAST(v_inv.quantity - v_inv.allocated, v_remaining);
                
                IF v_take > 0 THEN
                    INSERT INTO tmp_wave_tasks (order_item_id, product_id, box_id, quantity, zone, order_id, sku)
                    VALUES (v_item.id, v_item.product_id, v_inv.box_id, v_take, COALESCE(v_inv.loc_zone, 'DEFAULT'), v_order.id, v_item.sku);
                    
                    UPDATE bulk_inventory SET allocated_quantity = COALESCE(allocated_quantity, 0) + v_take WHERE id = v_inv.id;
                    
                    INSERT INTO transactions (type, entity_type, sku, quantity, reference_id, from_box_id, user_id, note, created_at)
                    VALUES ('RESERVE', 'ITEM', v_item.sku, v_take, v_order.id, v_inv.box_id, p_user_id, 'Wave Reserve: ' || v_wave.code, NOW());

                    v_remaining := v_remaining - v_take;
                END IF;
            END LOOP;

            IF v_remaining > 0 THEN
                RAISE EXCEPTION 'Thiếu hàng cho SKU % trong đơn % (Còn thiếu: %)', v_item.sku, v_order.code, v_remaining;
            END IF;
        END LOOP;

        UPDATE outbound_orders SET status = 'ALLOCATED' WHERE id = v_order.id;
    END LOOP;

    -- C. Create Jobs per Zone
    FOR v_zone IN SELECT DISTINCT zone FROM tmp_wave_tasks
    LOOP
        v_job_count := v_job_count + 1;
        v_job_code := v_wave.code || '-Z-' || v_zone;
        
        INSERT INTO picking_jobs (code, wave_id, type, status, zone, created_at)
        VALUES (v_job_code, p_wave_id, 'WAVE_PICK', 'OPEN', v_zone, NOW())
        RETURNING id INTO v_job_id;

        -- Associate tasks to this job
        INSERT INTO picking_tasks (job_id, order_item_id, product_id, box_id, quantity, status, created_at)
        SELECT v_job_id, order_item_id, product_id, box_id, quantity, 'PENDING', NOW()
        FROM tmp_wave_tasks
        WHERE zone = v_zone;
        
        v_task_count := v_task_count + (SELECT count(*) FROM tmp_wave_tasks WHERE zone = v_zone);
    END LOOP;

    -- D. Update Wave Status
    UPDATE pick_waves SET status = 'RELEASED', released_at = NOW() WHERE id = p_wave_id;

    RETURN jsonb_build_object(
        'success', true, 
        'message', 'Duyệt Wave thành công. Đã tạo ' || v_job_count || ' Jobs theo phân vùng.', 
        'jobs_created', v_job_count,
        'orders', v_order_count,
        'tasks', v_task_count
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;
