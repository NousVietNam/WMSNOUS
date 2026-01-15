-- Create destinations table (Stores, Branches, Partners, Customers)
CREATE TABLE IF NOT EXISTS destinations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT UNIQUE NOT NULL, -- Customer Code or Store Code
    name TEXT NOT NULL,
    address TEXT,
    phone TEXT,
    email TEXT,
    type TEXT DEFAULT 'store', -- 'store' (Internal/Transfer), 'customer' (External/Sale)
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS for destinations
ALTER TABLE destinations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable all access for authenticated users" ON destinations FOR ALL USING (auth.role() = 'authenticated');

-- Seed data
INSERT INTO destinations (code, name, type) VALUES 
('STORE-HN', 'Cửa Hàng Hà Nội', 'store'),
('STORE-HCM', 'Cửa Hàng HCM', 'store'),
('CUST-001', 'Khách hàng A', 'customer'),
('CUST-002', 'Khách hàng B', 'customer')
ON CONFLICT (code) DO NOTHING;

-- Alter transfer_orders to add destination_id
ALTER TABLE transfer_orders ADD COLUMN IF NOT EXISTS destination_id UUID REFERENCES destinations(id) ON DELETE SET NULL;
-- We can also add order_type to transfer_orders explicitly if we want to cache it, 
-- but we can look it up via destination_id.
-- Let's just rely on destination_id.
