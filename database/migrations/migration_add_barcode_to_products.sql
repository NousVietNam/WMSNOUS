-- Add barcode column to products table if it doesn't exist
ALTER TABLE products ADD COLUMN IF NOT EXISTS barcode TEXT;

-- Create an index for faster searching by barcode
CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);
