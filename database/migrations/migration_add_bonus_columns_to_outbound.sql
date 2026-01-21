-- Add bonus columns to outbound_orders
ALTER TABLE outbound_orders ADD COLUMN IF NOT EXISTS is_bonus_consideration BOOLEAN DEFAULT FALSE;
ALTER TABLE outbound_orders ADD COLUMN IF NOT EXISTS is_bonus_calculation BOOLEAN DEFAULT FALSE;
