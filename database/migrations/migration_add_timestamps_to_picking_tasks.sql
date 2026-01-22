-- Add created_at to picking_tasks
-- This column is required by the allocate_outbound RPC

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'picking_tasks' AND column_name = 'created_at') THEN
        ALTER TABLE picking_tasks ADD COLUMN created_at TIMESTAMPTZ DEFAULT NOW();
    END IF;
END $$;
