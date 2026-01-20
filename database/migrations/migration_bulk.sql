-- 1. Create Bulk Inventory Table
CREATE TABLE IF NOT EXISTS bulk_inventory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Relationships
    product_id UUID REFERENCES products(id) NOT NULL,
    location_id UUID REFERENCES locations(id),
    
    -- Core Data
    quantity INTEGER NOT NULL DEFAULT 0,
    pallet_code TEXT,       -- LPN / Barcode of Pallet
    batch_number TEXT,      -- Production Batch
    
    -- Origins
    factory_source TEXT,    -- e.g. 'Factory A', 'Factory B'
    received_at TIMESTAMPTZ DEFAULT NOW(),
    expiry_date DATE,
    
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Add Indexes for Performance
CREATE INDEX IF NOT EXISTS idx_bulk_inventory_product_id ON bulk_inventory(product_id);
CREATE INDEX IF NOT EXISTS idx_bulk_inventory_location_id ON bulk_inventory(location_id);
CREATE INDEX IF NOT EXISTS idx_bulk_inventory_pallet_code ON bulk_inventory(pallet_code);

-- 3. Add Channel Configuration to Products Table
-- This controls which channel(s) can sell each product
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS fulfillment_channels TEXT[] DEFAULT '{RETAIL}';
-- Values: 'RETAIL' (from boxes), 'WHOLESALE' (from bulk_inventory)
-- Example: '{RETAIL}' = only retail, '{WHOLESALE}' = only wholesale, '{RETAIL,WHOLESALE}' = both

-- 4. Add warehouse_type to orders for routing
ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS warehouse_type TEXT DEFAULT 'RETAIL';
-- Values: 'RETAIL' or 'WHOLESALE'

-- Reload configuration
NOTIFY pgrst, 'reload config';
