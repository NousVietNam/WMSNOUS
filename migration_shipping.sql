-- Create Shipments Table
CREATE TABLE IF NOT EXISTS shipments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT UNIQUE NOT NULL, -- e.g. SHIP-2023-001
    plate_number TEXT, -- Truck/Vehicle Number
    driver_name TEXT,
    status TEXT DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'SHIPPED', 'CANCELLED')),
    created_at TIMESTAMPTZ DEFAULT now(),
    created_by UUID REFERENCES users(id)
);

-- Add shipment_id to Orders
ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS shipment_id UUID REFERENCES shipments(id);

-- Ensure Order Status supports SHIPPED (Already done in previous step, but safe to repeat or skip)
-- (Previous migration script handled this check constraint update)

-- Reload Config
NOTIFY pgrst, 'reload config';
