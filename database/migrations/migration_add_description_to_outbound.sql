-- Add description column to outbound_orders
ALTER TABLE outbound_orders ADD COLUMN IF NOT EXISTS description TEXT;
