
-- 1. Fix specific case for Order SO-0126-00018
DO $$
DECLARE
    -- The user clarified: PICK-SO-0126-00018 -> SO-0126-00018
    v_target_code TEXT := 'SO-0126-00018'; 
    v_order_id UUID;
    v_current_status TEXT;
    v_job_status TEXT;
BEGIN
    -- Try to find the order by CODE
    SELECT id, status INTO v_order_id, v_current_status 
    FROM outbound_orders 
    WHERE code = v_target_code;
    
    IF v_order_id IS NULL THEN
        RAISE NOTICE 'Order % not found. Trying to search Job...', v_target_code;
        -- If order not found by code, maybe search Job by code and get order_id
        SELECT order_id INTO v_order_id FROM picking_jobs WHERE code = 'PICK-' || v_target_code;
        
        IF v_order_id IS NOT NULL THEN
             SELECT status INTO v_current_status FROM outbound_orders WHERE id = v_order_id;
             RAISE NOTICE 'Found Order via Job code. Order Status: %', v_current_status;
        END IF;
    ELSE
        RAISE NOTICE 'Order Found: %. Status: %', v_target_code, v_current_status;
    END IF;

    -- Update if found
    IF v_order_id IS NOT NULL THEN
        -- Check if linked job is completed
        SELECT status INTO v_job_status FROM picking_jobs WHERE order_id = v_order_id ORDER BY created_at DESC LIMIT 1;
        RAISE NOTICE 'Linked Job Status: %', v_job_status;
        
        IF v_current_status IN ('PICKING', 'ALLOCATED', 'READY') THEN
             UPDATE outbound_orders SET status = 'PACKED' WHERE id = v_order_id;
             RAISE NOTICE '--> FORCED UPDATE Order % to PACKED', v_target_code;
        ELSE
             RAISE NOTICE 'Order status is already % (not PICKING/ALLOCATED/READY). No action.', v_current_status;
        END IF;
    ELSE
        RAISE NOTICE 'Could not identify Order %', v_target_code;
    END IF;
END $$;

-- 2. General Fix: Update ALL orders that have all jobs completed but are stuck in PICKING
UPDATE outbound_orders o
SET status = 'PACKED'
WHERE o.status IN ('PICKING', 'ALLOCATED', 'READY')
  AND EXISTS (
      SELECT 1 FROM picking_jobs j 
      WHERE j.order_id = o.id AND j.status = 'COMPLETED'
  )
  AND NOT EXISTS (
      SELECT 1 FROM picking_jobs j 
      WHERE j.order_id = o.id AND j.status != 'COMPLETED' AND j.status != 'CANCELLED'
  );
