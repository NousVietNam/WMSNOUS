
-- =====================================================
-- Migration: Fix Wave Release (Jobs & Tasks)
-- Description: 1. Harmonize picking_jobs schema
--              2. Rewrite release_wave to create Tasks
-- =====================================================

DO $$
BEGIN
    -- 1. Harmonize picking_jobs
    -- Ensure outbound_order_id is nullable (to allow Wave jobs)
    ALTER TABLE IF EXISTS picking_jobs ALTER COLUMN outbound_order_id DROP NOT NULL;
    
    -- Ensure code exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'picking_jobs' AND column_name = 'code') THEN
        ALTER TABLE picking_jobs ADD COLUMN code TEXT;
    END IF;
    
    -- Ensure wave_id exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'picking_jobs' AND column_name = 'wave_id') THEN
        ALTER TABLE picking_jobs ADD COLUMN wave_id UUID REFERENCES public.pick_waves(id);
    END IF;

    -- Update unique constraint if it only covers code
    -- (We'll just make code unique manually if needed)
    -- ALTER TABLE picking_jobs ADD CONSTRAINT picking_jobs_code_key UNIQUE (code);
END $$;

-- 2. Rewrite release_wave RPC
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
         RETURN jsonb_build_object('success', false, 'error', 'Wave status is invalid: ' || v_wave.status);
    END IF;

    -- B. Create ONE Master Picking Job for the whole Wave
    v_job_code := 'W-JOB-' || v_wave.code;
    
    INSERT INTO picking_jobs (code, wave_id, type, status, created_at)
    VALUES (v_job_code, p_wave_id, 'ITEM_PICK', 'OPEN', NOW())
    RETURNING id INTO v_job_id;

    -- C. Loop through all orders and items to create Tasks
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
            
            -- Find Inventory in BULK_INVENTORY (for BULK waves)
            -- We order by FIFO (created_at)
            FOR v_inv IN 
                SELECT id, box_id, location_id, quantity, COALESCE(allocated_quantity, 0) as allocated
                FROM bulk_inventory
                WHERE product_id = v_item.product_id
                  AND (quantity - COALESCE(allocated_quantity, 0)) > 0
                ORDER BY created_at ASC
                FOR UPDATE
            LOOP
                IF v_remaining <= 0 THEN EXIT; END IF;
                
                v_take := LEAST(v_inv.quantity - v_inv.allocated, v_remaining);
                
                IF v_take > 0 THEN
                    -- Create Picking Task
                    INSERT INTO picking_tasks (
                        job_id, 
                        order_item_id, 
                        product_id, 
                        box_id, 
                        quantity, 
                        status, 
                        created_at
                    )
                    VALUES (
                        v_job_id, 
                        v_item.id, 
                        v_item.product_id, 
                        v_inv.box_id, 
                        v_take, 
                        'PENDING', 
                        NOW()
                    );
                    
                    v_task_count := v_task_count + 1;

                    -- Hard Allocation
                    UPDATE bulk_inventory 
                    SET allocated_quantity = COALESCE(allocated_quantity, 0) + v_take 
                    WHERE id = v_inv.id;
                    
                    -- Log Transaction
                    INSERT INTO transactions (type, entity_type, sku, quantity, reference_id, from_box_id, user_id, note, created_at)
                    VALUES ('RESERVE', 'ITEM', v_item.sku, v_take, v_order.id, v_inv.box_id, p_user_id, 'Phân bổ Wave ' || v_wave.code, NOW());

                    v_remaining := v_remaining - v_take;
                END IF;
            END LOOP;

            -- Check if fully allocated
            IF v_remaining > 0 THEN
                -- In a real production system, we might fail the whole wave or just this item.
                -- For now, let's RAISE EXCEPTION to rollback and inform the user.
                RAISE EXCEPTION 'Không đủ tồn kho cho SKU % trong đơn %. (Thiếu: %)', v_item.sku, v_order.code, v_remaining;
            END IF;

        END LOOP;

        -- Update Order Status
        UPDATE outbound_orders SET status = 'ALLOCATED' WHERE id = v_order.id;
    END LOOP;

    -- D. Update Wave Status
    UPDATE pick_waves 
    SET status = 'RELEASED', released_at = NOW() 
    WHERE id = p_wave_id;

    RETURN jsonb_build_object(
        'success', true, 
        'message', 'Wave Released Successfully', 
        'job_id', v_job_id,
        'orders', v_order_count,
        'tasks', v_task_count
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;
