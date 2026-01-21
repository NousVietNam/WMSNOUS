-- =====================================================
-- Migration: Repair Outbound Schema (Column Rename & Sync)
-- Description: Fix naming mismatch between box_id and from_box_id
--              Ensure foreign keys are correctly set for joins.
-- =====================================================

DO $$ 
BEGIN
    -- 1. Rename box_id to from_box_id in outbound_order_items if it exists
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'outbound_order_items' AND column_name = 'box_id') THEN
        -- Check if from_box_id already exists (unlikely given browser check, but for safety)
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'outbound_order_items' AND column_name = 'from_box_id') THEN
            ALTER TABLE outbound_order_items RENAME COLUMN box_id TO from_box_id;
        END IF;
    END IF;

    -- 2. Ensure foreign key exists for from_box_id
    -- Drop existing if any to avoid duplicates or name conflicts
    ALTER TABLE outbound_order_items DROP CONSTRAINT IF EXISTS fk_ooi_from_box;
    ALTER TABLE outbound_order_items ADD CONSTRAINT fk_ooi_from_box FOREIGN KEY (from_box_id) REFERENCES boxes(id);

    -- 3. Ensure other columns from unified spec exist in outbound_orders (Safety)
    ALTER TABLE outbound_orders ADD COLUMN IF NOT EXISTS sale_class TEXT CHECK (sale_class IN ('NORMAL', 'PROMOTION')) DEFAULT 'NORMAL';
    ALTER TABLE outbound_orders ADD COLUMN IF NOT EXISTS is_bonus_consideration BOOLEAN DEFAULT FALSE;
    ALTER TABLE outbound_orders ADD COLUMN IF NOT EXISTS is_bonus_calculation BOOLEAN DEFAULT FALSE;
    ALTER TABLE outbound_orders ADD COLUMN IF NOT EXISTS sale_staff_id UUID REFERENCES internal_staff(id);

    -- 4. Sync status check constraint for boxes
    ALTER TABLE boxes DROP CONSTRAINT IF EXISTS boxes_status_check;
    ALTER TABLE boxes ADD CONSTRAINT boxes_status_check CHECK (status IN ('OPEN', 'CLOSED', 'FULL', 'LOCKED', 'SHIPPED'));

END $$;

-- 5. Re-grant permissions just in case
GRANT ALL ON TABLE outbound_order_items TO postgres, anon, authenticated, service_role;
GRANT ALL ON TABLE outbound_orders TO postgres, anon, authenticated, service_role;
GRANT ALL ON TABLE boxes TO postgres, anon, authenticated, service_role;
