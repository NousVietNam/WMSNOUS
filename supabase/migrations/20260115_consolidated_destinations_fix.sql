-- 1. Create destinations table (if not exists)
CREATE TABLE IF NOT EXISTS destinations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    address TEXT,
    phone TEXT,
    email TEXT,
    type TEXT DEFAULT 'store', -- 'store' or 'customer'
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Enable RLS
ALTER TABLE destinations ENABLE ROW LEVEL SECURITY;

-- Safely create policy
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'destinations' AND policyname = 'Enable all access for authenticated users'
    ) THEN
        CREATE POLICY "Enable all access for authenticated users" ON destinations FOR ALL USING (auth.role() = 'authenticated');
    END IF;
END
$$;

-- 3. Seed Data
INSERT INTO destinations (code, name, type) VALUES 
('STORE-HN', 'Cửa Hàng Hà Nội', 'store'),
('STORE-HCM', 'Cửa Hàng HCM', 'store'),
('CUST-001', 'Khách hàng A', 'customer'),
('CUST-002', 'Khách hàng B', 'customer')
ON CONFLICT (code) DO NOTHING;

-- 4. Update transfer_orders table
ALTER TABLE transfer_orders ADD COLUMN IF NOT EXISTS destination_id UUID;

-- 5. Fix Foreign Key Relationship
-- Drop old constraint if exists to be safe
ALTER TABLE transfer_orders DROP CONSTRAINT IF EXISTS transfer_orders_destination_id_fkey;

-- Add constraint explicitly
ALTER TABLE transfer_orders 
ADD CONSTRAINT transfer_orders_destination_id_fkey 
FOREIGN KEY (destination_id) REFERENCES destinations(id)
ON DELETE SET NULL;
