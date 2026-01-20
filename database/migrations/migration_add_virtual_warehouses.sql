-- Migration: Add Virtual Warehouses (Kho Ảo)
-- 1. Create 'warehouses' table
CREATE TABLE IF NOT EXISTS warehouses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Add 'warehouse_id' to 'inventory_items' and 'transactions'
ALTER TABLE inventory_items 
ADD COLUMN IF NOT EXISTS warehouse_id UUID REFERENCES warehouses(id);

ALTER TABLE transactions 
ADD COLUMN IF NOT EXISTS warehouse_id UUID REFERENCES warehouses(id);

-- 3. Seed Data & Backfill
DO $$ 
DECLARE 
    wh_retail_id UUID;
    wh_bulk_id UUID;
BEGIN
    -- Create "Hàng lẻ" (Retail)
    INSERT INTO warehouses (code, name, description) 
    VALUES ('RETAIL', 'Hàng lẻ', 'Kho hàng lẻ (Mặc định)')
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name
    RETURNING id INTO wh_retail_id;

    -- Create "Hàng nhiều" (Bulk)
    INSERT INTO warehouses (code, name, description) 
    VALUES ('BULK', 'Hàng nhiều', 'Kho hàng sỉ/thùng')
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name
    RETURNING id INTO wh_bulk_id;

    -- Backfill: Update ALL existing inventory_items to "Hàng lẻ"
    UPDATE inventory_items 
    SET warehouse_id = wh_retail_id 
    WHERE warehouse_id IS NULL;

    -- Backfill: Update ALL existing transactions to "Hàng lẻ"
    UPDATE transactions 
    SET warehouse_id = wh_retail_id 
    WHERE warehouse_id IS NULL;

    RAISE NOTICE 'Migration Complete. Default Warehouse (Retail) ID: %', wh_retail_id;
END $$;

-- 4. Reload Schema Cache
NOTIFY pgrst, 'reload config';
