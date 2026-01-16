-- Migration: Add missing columns for Transfer Transactions
-- Reason: The 'Approve' action writes to reference_id, reference_code, and note which might be missing.

ALTER TABLE transactions 
ADD COLUMN IF NOT EXISTS reference_id UUID,
ADD COLUMN IF NOT EXISTS reference_code TEXT,
ADD COLUMN IF NOT EXISTS note TEXT;

-- Reload config
NOTIFY pgrst, 'reload config';
