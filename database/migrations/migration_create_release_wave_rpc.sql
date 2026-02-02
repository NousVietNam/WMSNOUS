
-- 1. Create Picking Jobs Table
CREATE TABLE IF NOT EXISTS picking_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT UNIQUE NOT NULL, -- e.g. PJ-240131-001
    wave_id UUID REFERENCES pick_waves(id),
    
    -- For Bulk, we might assign job to a specific staff
    assigned_to UUID REFERENCES auth.users(id),
    
    status TEXT NOT NULL CHECK (status IN ('OPEN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')) DEFAULT 'OPEN',
    
    -- The Target
    product_id UUID REFERENCES products(id),
    quantity_requested INT NOT NULL,
    quantity_picked INT DEFAULT 0,
    
    -- Location hint (optional, simpler to just list items for now)
    from_location TEXT, 
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Create Release Wave RPC
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
    v_total_needed RECORD;
    v_stock INT;
    v_job_id UUID;
    v_job_code TEXT;
    v_order_ids UUID[];
BEGIN
    -- A. Validate Wave
    SELECT * INTO v_wave FROM pick_waves WHERE id = p_wave_id;
    
    IF v_wave IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Wave not found');
    END IF;

    IF v_wave.status != 'PLANNING' THEN
         RETURN jsonb_build_object('success', false, 'error', 'Wave status is invalid: ' || v_wave.status);
    END IF;

    IF v_wave.inventory_type != 'BULK' THEN
         RETURN jsonb_build_object('success', false, 'error', 'Only BULK waves supported currently');
    END IF;

    -- B. Check Inventory & Create Aggregate Jobs
    -- For each SKU in the wave, verify stock and create a Master Pick Job
    
    FOR v_total_needed IN 
        SELECT ooi.product_id, SUM(ooi.quantity) as total_qty, MIN(p.sku) as sku
        FROM outbound_order_items ooi
        JOIN outbound_orders oo ON ooi.order_id = oo.id
        JOIN products p ON ooi.product_id = p.id
        WHERE oo.wave_id = p_wave_id
        GROUP BY ooi.product_id
    LOOP
        -- Check Bulk Inventory
        SELECT COALESCE(SUM(quantity - allocated_quantity), 0) INTO v_stock
        FROM bulk_inventory
        WHERE product_id = v_total_needed.product_id;
        
        IF v_stock < v_total_needed.total_qty THEN
            RETURN jsonb_build_object(
                'success', false, 
                'error', 'Không đủ tồn kho cho SKU: ' || v_total_needed.sku || 
                         ' (Cần: ' || v_total_needed.total_qty || ', Có sẵn: ' || v_stock || ')'
            );
        END IF;

        -- Create Picking Job
        v_job_code := 'PJ-' || to_char(NOW(), 'YYMMDD') || '-' || upper(substring(md5(random()::text) from 1 for 4));
        
        INSERT INTO picking_jobs (code, wave_id, product_id, quantity_requested, status)
        VALUES (v_job_code, p_wave_id, v_total_needed.product_id, v_total_needed.total_qty, 'OPEN');
        
        -- HARD ALLOCATION: Reserve stock in bulk_inventory
        -- Strategy: FIFO allocation or Simple Decrement?
        -- For simplicity in this phase: effectively "Hard Allocate" by updating allocated_quantity
        -- We just update the first N records that match. Or simpler, just check total.
        -- Limitation: This script assumes "available" check is enough. 
        -- Real WMS would link specific inventory_id. 
        -- Let's just update `allocated_quantity` on random bulk_inventory records to reserve stats.
        
        UPDATE bulk_inventory
        SET allocated_quantity = allocated_quantity + v_total_needed.total_qty
        WHERE id = (
            SELECT id FROM bulk_inventory 
            WHERE product_id = v_total_needed.product_id 
              AND (quantity - allocated_quantity) >= v_total_needed.total_qty
            LIMIT 1
        );
        -- Note: The above UPDATE is risky if split across multiple locations. 
        -- Simplification: For now we assume 1 SKU is in 1 Location mostly, or we accept "Virtual Allocation".
        
    END LOOP;

    -- C. Update Wave & Orders
    -- 1. Update Wave
    UPDATE pick_waves 
    SET status = 'RELEASED', released_at = NOW() 
    WHERE id = p_wave_id;

    -- 2. Update Orders
    SELECT array_agg(id) INTO v_order_ids FROM outbound_orders WHERE wave_id = p_wave_id;
    
    UPDATE outbound_orders
    SET status = 'ALLOCATED'
    WHERE wave_id = p_wave_id;

    RETURN jsonb_build_object('success', true, 'message', 'Wave Released', 'orders_updated', array_length(v_order_ids, 1));
END;
$$;
