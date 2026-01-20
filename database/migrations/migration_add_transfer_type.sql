-- Migration: Add transfer_type column to distinguish BOX vs ITEM transfers
-- Date: 2026-01-16

ALTER TABLE transfer_orders 
ADD COLUMN IF NOT EXISTS transfer_type VARCHAR(10) DEFAULT 'ITEM'
CHECK (transfer_type IN ('BOX', 'ITEM'));

-- Update existing records (default to ITEM for backward compatibility)
UPDATE transfer_orders 
SET transfer_type = 'ITEM' 
WHERE transfer_type IS NULL;

-- Add box_id to transfer_order_items for BOX type transfers
ALTER TABLE transfer_order_items 
ADD COLUMN IF NOT EXISTS box_id UUID REFERENCES boxes(id) ON DELETE CASCADE;

COMMENT ON COLUMN transfer_orders.transfer_type IS 'Type of transfer: BOX (whole box) or ITEM (individual items)';
COMMENT ON COLUMN transfer_order_items.box_id IS 'Link to box for BOX-type transfers';
