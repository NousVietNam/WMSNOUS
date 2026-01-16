-- Remove existing constraint (if default name used)
ALTER TABLE picking_jobs DROP CONSTRAINT IF EXISTS picking_jobs_transfer_order_id_fkey;

-- Re-add with ON DELETE CASCADE
ALTER TABLE picking_jobs 
ADD CONSTRAINT picking_jobs_transfer_order_id_fkey 
FOREIGN KEY (transfer_order_id) 
REFERENCES transfer_orders(id) 
ON DELETE CASCADE;
