
-- Add inventory_type column to outbound_orders
ALTER TABLE outbound_orders 
ADD COLUMN IF NOT EXISTS inventory_type text DEFAULT 'PIECE';

-- Add check constraint to ensure only valid values
ALTER TABLE outbound_orders 
DROP CONSTRAINT IF EXISTS outbound_orders_inventory_type_check;

ALTER TABLE outbound_orders 
ADD CONSTRAINT outbound_orders_inventory_type_check 
CHECK (inventory_type IN ('PIECE', 'BULK'));

-- Backfill existing records (optional, but good for consistency)
UPDATE outbound_orders 
SET inventory_type = 'PIECE' 
WHERE inventory_type IS NULL;

-- Comment
COMMENT ON COLUMN outbound_orders.inventory_type IS 'Discriminator: PIECE for Retail, BULK for Wholesale';
