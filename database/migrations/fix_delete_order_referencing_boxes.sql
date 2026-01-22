-- =====================================================
-- Fix: Allow Deleting Orders that have Locked Boxes
-- Description: When an outbound_order is deleted, any boxes referencing it 
--              should be unlocked (set outbound_order_id to NULL) automatically.
-- =====================================================

BEGIN;

-- 1. Drop the existing strict constraint
ALTER TABLE boxes DROP CONSTRAINT IF EXISTS boxes_outbound_order_id_fkey;

-- 2. Re-add with ON DELETE SET NULL
ALTER TABLE boxes
    ADD CONSTRAINT boxes_outbound_order_id_fkey
    FOREIGN KEY (outbound_order_id)
    REFERENCES outbound_orders(id)
    ON DELETE SET NULL;

COMMIT;
