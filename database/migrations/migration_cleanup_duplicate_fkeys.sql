-- =====================================================
-- Migration: Cleanup Duplicate Foreign Keys
-- Description: Drop redundant fkey constraints on outbound_order_items
--              to resolve PostgREST ambiguity (Error 300).
-- =====================================================

DO $$ 
BEGIN
    -- 1. Drop the old legacy constraint (renamed column but kept old fkey name)
    ALTER TABLE outbound_order_items DROP CONSTRAINT IF EXISTS outbound_order_items_box_id_fkey;
    
    -- 2. Ensure only our new clean one exists
    -- (It was already added in previous migration, but for safety in case it was missed)
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_ooi_from_box') THEN
        ALTER TABLE outbound_order_items ADD CONSTRAINT fk_ooi_from_box FOREIGN KEY (from_box_id) REFERENCES boxes(id);
    END IF;

END $$;
