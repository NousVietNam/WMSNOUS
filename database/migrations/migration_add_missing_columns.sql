-- Add default_discount to customers if not exists
ALTER TABLE customers ADD COLUMN IF NOT EXISTS default_discount DECIMAL(5, 2) DEFAULT 0;

-- Ensure code column exists in customers (it should, but for safety)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'customers' AND column_name = 'code') THEN
        ALTER TABLE customers ADD COLUMN code TEXT;
        ALTER TABLE customers ADD CONSTRAINT customers_code_key UNIQUE (code);
    END IF;
END $$;

-- Add sale_class to outbound_orders to persist Normal/Promotion state
ALTER TABLE outbound_orders ADD COLUMN IF NOT EXISTS sale_class TEXT CHECK (sale_class IN ('NORMAL', 'PROMOTION')) DEFAULT 'NORMAL';

-- Ensure description and bonus columns exist (Safety Check)
ALTER TABLE outbound_orders ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE outbound_orders ADD COLUMN IF NOT EXISTS is_bonus_consideration BOOLEAN DEFAULT FALSE;
ALTER TABLE outbound_orders ADD COLUMN IF NOT EXISTS is_bonus_calculation BOOLEAN DEFAULT FALSE;

-- Comment: The barcode column in products table is already assumed to exist.
-- If not, it can be added:
-- ALTER TABLE products ADD COLUMN IF NOT EXISTS barcode TEXT;
