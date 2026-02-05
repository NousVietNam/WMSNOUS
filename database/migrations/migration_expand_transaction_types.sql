-- Migration: Expand Transaction Types
-- Description: Adds PICKING, PICK_EXCEPTION, and SWAP_PICK to the allowed transaction types.

ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_type_check;

ALTER TABLE transactions 
ADD CONSTRAINT transactions_type_check 
CHECK (type IN (
    'IMPORT', 
    'EXPORT', 
    'SHIP', 
    'SELL', 
    'TRANSFER_IN', 
    'TRANSFER_OUT', 
    'MOVE', 
    'MOVE_BOX', 
    'PICK_MOVE', 
    'PACK', 
    'ADJUST', 
    'AUDIT', 
    'INBOUND_BULK',
    'RESERVE', 
    'RELEASE',
    'MISCELLANEOUS_ISSUE',
    'MISCELLANEOUS_RECEIPT',
    'EXPORT_SALE',
    'EXPORT_GIFT',
    
    -- New Picking Types
    'PICKING',
    'PICK_EXCEPTION',
    'SWAP_PICK'
));
