-- DROP existing tables/policies to avoid conflicts
DROP TABLE IF EXISTS transfer_order_items CASCADE;
DROP TABLE IF EXISTS transfer_orders CASCADE;
DROP TABLE IF EXISTS bulk_order_items CASCADE;
DROP TABLE IF EXISTS bulk_orders CASCADE;
DROP TABLE IF EXISTS bulk_inventory CASCADE;
DROP TABLE IF EXISTS destinations CASCADE;

-- Create destinations table (Stores, Branches, Partners)
CREATE TABLE destinations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    address TEXT,
    phone TEXT,
    type TEXT DEFAULT 'store', -- store, warehouse, partner
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create bulk_inventory table
CREATE TABLE bulk_inventory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    location_id UUID REFERENCES locations(id) ON DELETE SET NULL, 
    quantity INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create bulk_orders table 
CREATE TABLE bulk_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT UNIQUE NOT NULL,
    customer_name TEXT,
    status TEXT DEFAULT 'pending', 
    user_id UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create bulk_order_items table
CREATE TABLE bulk_order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES bulk_orders(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create transfer_orders table (Distribution)
CREATE TABLE transfer_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT UNIQUE NOT NULL,
    from_location_id UUID REFERENCES locations(id) ON DELETE SET NULL, 
    destination_id UUID REFERENCES destinations(id) ON DELETE SET NULL, -- Replaced text with FK
    destination_text TEXT, -- Fallback if needed, or transient
    status TEXT DEFAULT 'pending', 
    created_by UUID REFERENCES auth.users(id),
    approved_by UUID REFERENCES auth.users(id),
    note TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create transfer_order_items table
CREATE TABLE transfer_order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transfer_id UUID REFERENCES transfer_orders(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE destinations ENABLE ROW LEVEL SECURITY;
ALTER TABLE bulk_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE bulk_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE bulk_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE transfer_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE transfer_order_items ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Enable all access for authenticated users" ON destinations FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Enable all access for authenticated users" ON bulk_inventory FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Enable all access for authenticated users" ON bulk_orders FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Enable all access for authenticated users" ON bulk_order_items FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Enable all access for authenticated users" ON transfer_orders FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Enable all access for authenticated users" ON transfer_order_items FOR ALL USING (auth.role() = 'authenticated');

-- Seed some default destinations
INSERT INTO destinations (code, name, type) VALUES 
('STORE-HN', 'Cửa Hàng Hà Nội', 'store'),
('STORE-HCM', 'Cửa Hàng HCM', 'store'),
('PARTNER-A', 'Đối tác Đại lý A', 'partner');
