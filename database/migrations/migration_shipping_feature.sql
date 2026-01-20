-- Migration: Shipping Feature
-- 1. Update Orders Status Check
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check CHECK (status IN ('PENDING', 'ALLOCATED', 'PICKING', 'COMPLETED', 'SHIPPED', 'CANCELLED'));

-- 2. Update Transfer Orders Status Check
ALTER TABLE transfer_orders DROP CONSTRAINT IF EXISTS transfer_orders_status_check;
-- Note: Some older versions might not have the constraint or have different names. 
-- For safety, we just add it to ensure consistency.
ALTER TABLE transfer_orders ADD CONSTRAINT transfer_orders_status_check CHECK (status IN ('pending', 'approved', 'allocated', 'picking', 'completed', 'shipped', 'cancelled'));

-- 3. Add shipped_at columns
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipped_at TIMESTAMPTZ;
ALTER TABLE transfer_orders ADD COLUMN IF NOT EXISTS shipped_at TIMESTAMPTZ;

-- 4. Reload Postgrest
NOTIFY pgrst, 'reload config';
