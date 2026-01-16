-- Add from_location_id to transfer_order_items
ALTER TABLE transfer_order_items ADD COLUMN IF NOT EXISTS from_location_id UUID REFERENCES locations(id);

-- Make transfer_orders.from_location_id nullable
ALTER TABLE transfer_orders ALTER COLUMN from_location_id DROP NOT NULL;

-- Notify schema reload
NOTIFY pgrst, 'reload schema';
