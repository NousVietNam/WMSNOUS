-- Add 'type' column to orders table to distinguish between BOX and ITEM orders
ALTER TABLE orders ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'ITEM';

-- Optional: Add 'note' column if you want to support order notes
ALTER TABLE orders ADD COLUMN IF NOT EXISTS note TEXT;
