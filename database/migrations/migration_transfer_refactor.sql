-- Add hold_date to transfer_orders
ALTER TABLE transfer_orders ADD COLUMN IF NOT EXISTS hold_date TIMESTAMP WITH TIME ZONE;

-- Add start_date alias if preferred, but hold_date was requested
-- Add transfer_order_id to picking_jobs to link picking tasks to transfers
ALTER TABLE picking_jobs ADD COLUMN IF NOT EXISTS transfer_order_id UUID REFERENCES transfer_orders(id);

-- Make order_id nullable in picking_jobs if it wasn't already (assuming it was strict before)
ALTER TABLE picking_jobs ALTER COLUMN order_id DROP NOT NULL;

-- Add status 'allocated' and 'picking' to transfer_orders check constraint if exists
-- (Assuming status is text or needs update)
-- If status is a check constraint, we might need to drop and re-add. 
-- For now assuming text.
