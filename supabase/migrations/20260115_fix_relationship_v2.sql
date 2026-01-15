-- Ensure the column exists (idempotent)
ALTER TABLE transfer_orders ADD COLUMN IF NOT EXISTS destination_id UUID;

-- Drop any existing potential constraints to avoid duplicates or misnaming
ALTER TABLE transfer_orders DROP CONSTRAINT IF EXISTS transfer_orders_destination_id_fkey;
ALTER TABLE transfer_orders DROP CONSTRAINT IF EXISTS fk_transfer_orders_destination;

-- Explicitly add the constraint with the expected name
ALTER TABLE transfer_orders 
ADD CONSTRAINT transfer_orders_destination_id_fkey 
FOREIGN KEY (destination_id) REFERENCES destinations(id)
ON DELETE SET NULL;

-- Notify PostgREST/Supabase (usually automatic, but changing schema helps)
NOTIFY pgrst, 'reload schema';
