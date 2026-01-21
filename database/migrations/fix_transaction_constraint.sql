-- Add MISCELLANEOUS_ISSUE to allowable transaction types
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_type_check;

ALTER TABLE transactions 
ADD CONSTRAINT transactions_type_check 
CHECK (type IN (
    -- Standard Types
    'IMPORT', 
    'EXPORT', 
    'SHIP', 
    'SELL', -- Often used for sales
    
    -- Transfer & Move
    'TRANSFER_IN', 
    'TRANSFER_OUT', 
    'MOVE', 
    'MOVE_BOX', 
    'PICK_MOVE', 
    
    -- Process Types
    'PACK', 
    'ADJUST', 
    'AUDIT', 
    'INBOUND_BULK',
    
    -- New Types
    'RESERVE', 
    'RELEASE',
    'MISCELLANEOUS_ISSUE',   -- Added this
    'MISCELLANEOUS_RECEIPT', -- Added for future symmetry
    
    -- Specific Export Types
    'EXPORT_SALE',
    'EXPORT_GIFT'
));
