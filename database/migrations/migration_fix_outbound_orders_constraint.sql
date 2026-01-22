-- Fix outbound_orders_status_check constraint (CORRECTED)
-- User confirmed 'APPROVED' is NOT a status (it's a separate is_approved flag).
-- Status flow: PENDING -> ALLOCATED -> PICKING ...

DO $$
BEGIN
    -- 1. Drop the restrictive constraint
    ALTER TABLE outbound_orders DROP CONSTRAINT IF EXISTS outbound_orders_status_check;

    -- 2. Clean up invalid data
    -- Any order currently marked as 'APPROVED' (incorrectly) should be 'PENDING'
    UPDATE outbound_orders 
    SET status = 'PENDING' 
    WHERE status = 'APPROVED';

    -- 3. Re-add the constraint with CORRECTED statuses (No 'APPROVED')
    ALTER TABLE outbound_orders ADD CONSTRAINT outbound_orders_status_check 
    CHECK (status IN ('DRAFT', 'PENDING', 'ALLOCATED', 'PICKING', 'PACKED', 'SHIPPED', 'COMPLETED', 'CANCELLED', 'RETURNED'));
END $$;
