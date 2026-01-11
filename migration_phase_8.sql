-- 1. Create Orders Table
CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT UNIQUE NOT NULL,
    customer_name TEXT,
    status TEXT DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'ALLOCATED', 'PICKING', 'COMPLETED', 'CANCELLED')),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Create Order Items Table
CREATE TABLE IF NOT EXISTS order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    allocated_quantity INTEGER DEFAULT 0,
    picked_quantity INTEGER DEFAULT 0
);

-- 3. Create Picking Jobs (One Job per User per Order usually, or many jobs per order)
CREATE TABLE IF NOT EXISTS picking_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES orders(id),
    user_id UUID REFERENCES users(id),
    status TEXT DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'IN_PROGRESS', 'COMPLETED')),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Create Picking Tasks (Specific instructions)
CREATE TABLE IF NOT EXISTS picking_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID REFERENCES picking_jobs(id) ON DELETE CASCADE,
    box_id UUID REFERENCES boxes(id),
    location_id UUID REFERENCES locations(id),
    product_id UUID REFERENCES products(id),
    quantity INTEGER NOT NULL,
    status TEXT DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PICKED', 'SKIPPED')),
    picked_at TIMESTAMPTZ
);

-- 5. Helper Functions for Counters (For Admin UI)
-- We can use Views or just count in code. 
-- But for "Lock delete if has items", a trigger or check is redundant if we handle in App.
-- Let's stick to App logic for now to keep DB simple, or add a simple View.

-- View for Locations with Box Count
CREATE OR REPLACE VIEW location_stats AS
SELECT 
    l.id,
    l.code,
    COUNT(b.id) as box_count
FROM locations l
LEFT JOIN boxes b ON b.location_id = l.id
GROUP BY l.id, l.code;

-- View for Boxes with Item Count
CREATE OR REPLACE VIEW box_stats AS
SELECT 
    b.id,
    b.code,
    COALESCE(SUM(i.quantity), 0) as total_items,
    COUNT(i.id) as distinct_items
FROM boxes b
LEFT JOIN inventory_items i ON i.box_id = b.id
GROUP BY b.id, b.code;

-- Reload config
NOTIFY pgrst, 'reload config';
