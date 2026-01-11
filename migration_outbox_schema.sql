-- Migration for Outbox Workflow
-- 1. Add 'type' to distinguish Storage vs Outbox
ALTER TABLE boxes 
ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'STORAGE' CHECK (type IN ('STORAGE', 'OUTBOX'));

-- 2. Add 'order_id' to link Outbox to an Order during picking
ALTER TABLE boxes 
ADD COLUMN IF NOT EXISTS order_id UUID REFERENCES orders(id);

-- Reload schema
NOTIFY pgrst, 'reload config';
