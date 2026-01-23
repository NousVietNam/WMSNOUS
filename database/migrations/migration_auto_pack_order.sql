
-- ==============================================================================
-- Migration: Auto-Pack Order when Jobs Completed
-- Description: Adds a trigger to automatically update Outbound Order status to 'PACKED'
--              when all associated Picking Jobs are 'COMPLETED'.
--              Also includes a Repair Script for existing stuck orders.
-- ==============================================================================

-- 1. Create Function to Check and Update Order Status
CREATE OR REPLACE FUNCTION check_order_packed_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_order_id UUID;
    v_pending_jobs_count INT;
BEGIN
    -- Only proceed if status changed to COMPLETED
    IF NEW.status = 'COMPLETED' AND (OLD.status IS DISTINCT FROM 'COMPLETED') THEN
        v_order_id := NEW.order_id;
        
        -- If job is linked to an order
        IF v_order_id IS NOT NULL THEN
            -- Check if there are any other jobs for this order that are NOT completed/cancelled
            SELECT COUNT(*) INTO v_pending_jobs_count
            FROM picking_jobs
            WHERE order_id = v_order_id
              AND status NOT IN ('COMPLETED', 'CANCELLED');
              
            -- If no pending jobs left, update Order to PACKED
            IF v_pending_jobs_count = 0 THEN
                UPDATE outbound_orders
                SET status = 'PACKED', updated_at = NOW()
                WHERE id = v_order_id
                  AND status IN ('PICKING', 'ALLOCATED', 'READY'); -- Only upgrade from these states
            END IF;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$;

-- 2. Create Trigger on picking_jobs
DROP TRIGGER IF EXISTS trg_auto_pack_order ON picking_jobs;

CREATE TRIGGER trg_auto_pack_order
AFTER UPDATE OF status ON picking_jobs
FOR EACH ROW
EXECUTE FUNCTION check_order_packed_status();

-- 3. REPAIR SCRIPT: Fix existing orders that are stuck
DO $$
DECLARE
    r RECORD;
    v_updated_count INT := 0;
BEGIN
    RAISE NOTICE 'Starting Repair for Stuck Orders...';
    
    FOR r IN
        SELECT o.id, o.code
        FROM outbound_orders o
        WHERE o.status IN ('PICKING', 'ALLOCATED', 'READY')
          -- Condition: Has at least one Completed Job
          AND EXISTS (
              SELECT 1 FROM picking_jobs j 
              WHERE j.order_id = o.id AND j.status = 'COMPLETED'
          )
          -- Condition: NO active jobs linked to this order
          AND NOT EXISTS (
              SELECT 1 FROM picking_jobs j 
              WHERE j.order_id = o.id AND j.status NOT IN ('COMPLETED', 'CANCELLED')
          )
    LOOP
        UPDATE outbound_orders 
        SET status = 'PACKED', updated_at = NOW()
        WHERE id = r.id;
        
        v_updated_count := v_updated_count + 1;
        RAISE NOTICE 'Fixed Order: %', r.code;
    END LOOP;
    
    RAISE NOTICE 'Repair Complete. Total Orders Fixed: %', v_updated_count;
END $$;
