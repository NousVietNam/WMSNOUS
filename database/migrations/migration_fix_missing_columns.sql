-- Run this in Supabase SQL Editor to fix the missing column error

ALTER TABLE inventory_items 
ADD COLUMN IF NOT EXISTS expiry_date TIMESTAMP WITH TIME ZONE;

-- Optional: Ensure other columns might be missing if schema drift happened
ALTER TABLE boxes 
ADD COLUMN IF NOT EXISTS location_id UUID REFERENCES locations(id);

-- Reload schema cache usually happens automatically, but if efficient, you can run:
NOTIFY pgrst, 'reload config';
