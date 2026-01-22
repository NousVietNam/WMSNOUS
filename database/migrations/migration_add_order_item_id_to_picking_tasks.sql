-- Add order_item_id to picking_tasks
-- This column is required to link specific picking tasks to the original order line items.

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'picking_tasks' AND column_name = 'order_item_id') THEN
        ALTER TABLE picking_tasks ADD COLUMN order_item_id UUID REFERENCES outbound_order_items(id) ON DELETE CASCADE;
    END IF;
END $$;
