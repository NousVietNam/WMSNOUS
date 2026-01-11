-- 1. Add Barcode to Products
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS barcode TEXT;

-- 2. Enhance Transactions Table
-- We add columns to track granular movements instead of just JSON 'details'
ALTER TABLE transactions 
ADD COLUMN IF NOT EXISTS entity_type TEXT CHECK (entity_type IN ('BOX', 'ITEM')),
ADD COLUMN IF NOT EXISTS entity_id UUID,
ADD COLUMN IF NOT EXISTS from_location_id UUID REFERENCES locations(id),
ADD COLUMN IF NOT EXISTS to_location_id UUID REFERENCES locations(id),
ADD COLUMN IF NOT EXISTS from_box_id UUID REFERENCES boxes(id),
ADD COLUMN IF NOT EXISTS to_box_id UUID REFERENCES boxes(id);

-- Reload config to ensure API picks up new columns
NOTIFY pgrst, 'reload config';
