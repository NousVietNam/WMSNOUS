-- Add columns for Order Management Enhancements

-- 1. Add Price to Products (Master Data)
ALTER TABLE products ADD COLUMN IF NOT EXISTS price NUMERIC DEFAULT 0;

-- 2. Add Sale Name and Discount to Orders
ALTER TABLE orders ADD COLUMN IF NOT EXISTS sale_name TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount NUMERIC DEFAULT 0;

-- 3. Add Price to Order Items (Snapshot)
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS price NUMERIC DEFAULT 0;

-- Optional: Update existing records IF needed (e.g. set default price)
-- UPDATE products SET price = 0 WHERE price IS NULL;
