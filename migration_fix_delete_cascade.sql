-- Migration: Fix Delete Cascade for Picking Jobs
-- Reason: Deleting a Transfer Order was blocked because connected Picking Jobs didn't auto-delete.

DO $$ 
BEGIN
    -- 1. Drop the existing foreign key constraint
    -- We try the specific name 'picking_jobs_transfer_order_id_fkey' first.
    -- If default naming was used (e.g. picking_jobs_transfer_order_id_fkey), this works.
    BEGIN
        ALTER TABLE picking_jobs DROP CONSTRAINT IF EXISTS picking_jobs_transfer_order_id_fkey;
    EXCEPTION
        WHEN undefined_object THEN NULL;
    END;

    -- 2. Add the constraint back with ON DELETE CASCADE
    ALTER TABLE picking_jobs 
    ADD CONSTRAINT picking_jobs_transfer_order_id_fkey 
    FOREIGN KEY (transfer_order_id) 
    REFERENCES transfer_orders(id) 
    ON DELETE CASCADE;
    
END $$;
