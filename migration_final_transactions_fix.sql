-- Migration: Final Fix for Transactions Table
-- Reason: Debugging revealed that 'transactions' table is missing 'product_id' and other reference columns used by the Approve logic.

-- 1. Add product_id column (and others if missed previously)
ALTER TABLE transactions 
ADD COLUMN IF NOT EXISTS product_id UUID REFERENCES products(id),
ADD COLUMN IF NOT EXISTS reference_id UUID,
ADD COLUMN IF NOT EXISTS reference_code TEXT,
ADD COLUMN IF NOT EXISTS note TEXT;

-- 2. Reload Schema Cache explicitly
NOTIFY pgrst, 'reload config';
