
CREATE OR REPLACE FUNCTION release_wave_v3(
    p_wave_id UUID,
    p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_wave RECORD;
    v_inventory_table TEXT;
    v_item RECORD;
    v_inv RECORD;
    v_remaining INT;
    v_take INT;
    v_job_id UUID;
    v_job_code TEXT;
    v_task_id UUID;
    v_jobs_created INT := 0;
    v_zones_allocated TEXT[] := ARRAY[]::TEXT[];
    v_current_zone TEXT;
BEGIN
    -- 1. Get Wave Header
    SELECT * INTO v_wave FROM pick_waves WHERE id = p_wave_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Wave not found');
    END IF;

    IF v_wave.status = 'COMPLETED' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Wave already completed');
    END IF;

    v_inventory_table := CASE WHEN v_wave.inventory_type = 'BULK' THEN 'bulk_inventory' ELSE 'inventory_items' END;

    -- 2. Clear old jobs/tasks if re-releasing (Safety)
    -- But usually we only release once. Let's assume PLANNING status.
    
    -- 3. Loop through Orders and Items in the Wave
    FOR v_item IN (
        SELECT oi.*, p.sku
        FROM outbound_order_items oi
        JOIN outbound_orders o ON oi.order_id = o.id
        JOIN products p ON oi.product_id = p.id
        WHERE o.wave_id = p_wave_id
    ) LOOP
        v_remaining := v_item.quantity;

        -- 4. Find Inventory (Priority: Level 1 -> LIFO)
        -- We loop through inventory and satisfy the demand
        FOR v_inv IN EXECUTE format('
            SELECT i.*, b.location_id, l.zone, l.level_order, b.code as box_code
            FROM %I i
            JOIN boxes b ON i.box_id = b.id
            JOIN locations l ON b.location_id = l.id
            WHERE i.product_id = %L 
              AND i.quantity > COALESCE(i.allocated_quantity, 0)
            ORDER BY 
                CASE WHEN l.level_order IN (0, 1) THEN 0 ELSE 1 END ASC,
                b.code DESC', -- LIFO
            v_inventory_table, v_item.product_id
        ) LOOP
            IF v_remaining <= 0 THEN EXIT; END IF;

            v_take := LEAST(v_remaining, v_inv.quantity - COALESCE(v_inv.allocated_quantity, 0));
            IF v_take <= 0 THEN CONTINUE; END IF;

            v_current_zone := COALESCE(v_inv.zone, 'DEFAULT');

            -- 5. Manage Job for this Zone
            -- Check if we already created a job for this zone in this wave
            SELECT id INTO v_job_id FROM picking_jobs 
            WHERE wave_id = p_wave_id AND zone = v_current_zone AND type = 'WAVE_PICK' AND status = 'PENDING'
            LIMIT 1;

            IF v_job_id IS NULL THEN
                v_job_id := gen_random_uuid();
                v_job_code := 'WP-' || SUBSTRING(v_wave.code, 1, 10) || '-' || v_current_zone;
                
                INSERT INTO picking_jobs (id, code, wave_id, type, zone, status)
                VALUES (v_job_id, v_job_code, p_wave_id, 'WAVE_PICK', v_current_zone, 'PENDING');
                
                v_jobs_created := v_jobs_created + 1;
                v_zones_allocated := array_append(v_zones_allocated, v_current_zone);
            END IF;

            -- 6. Create Task
            INSERT INTO picking_tasks (job_id, order_item_id, product_id, box_id, location_id, quantity, status)
            VALUES (v_job_id, v_item.id, v_item.product_id, v_inv.box_id, v_inv.location_id, v_take, 'PENDING');

            -- 7. Update Allocation
            EXECUTE format('UPDATE %I SET allocated_quantity = COALESCE(allocated_quantity, 0) + %L WHERE box_id = %L AND product_id = %L',
                v_inventory_table, v_take, v_inv.box_id, v_inv.product_id);

            v_remaining := v_remaining - v_take;
        END LOOP;

        -- 8. Verify if fully allocated
        IF v_remaining > 0 THEN
            RAISE EXCEPTION 'Insufficient stock for SKU % in Wave', v_item.sku;
        END IF;
    END LOOP;

    -- 9. Final Updates
    UPDATE pick_waves SET status = 'RELEASED' WHERE id = p_wave_id;
    UPDATE outbound_orders SET status = 'ALLOCATED', is_approved = true WHERE wave_id = p_wave_id;

    RETURN jsonb_build_object(
        'success', true,
        'jobs_created', v_jobs_created,
        'zones', v_zones_allocated
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;
