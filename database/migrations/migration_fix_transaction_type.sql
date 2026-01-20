-- Migration: Update Transactions Check Constraint to include ALL used types
-- Reason: To allow 'RESERVE' while preserving existing types like 'AUDIT', 'SHIP', etc.

DO $$ 
BEGIN
    -- 1. Try to drop the existing constraint
    BEGIN
        ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_type_check;
    EXCEPTION
        WHEN undefined_object THEN
            RAISE NOTICE 'Constraint transactions_type_check not found';
    END;
    
    -- 2. Add the updated constraint with SUPERYSET of all types found in codebase
    ALTER TABLE transactions 
    ADD CONSTRAINT transactions_type_check 
    CHECK (type IN (
        -- Standard Types
        'IMPORT', 
        'EXPORT', 
        'SHIP', 
        
        -- Transfer & Move
        'TRANSFER_IN', 
        'TRANSFER_OUT', 
        'MOVE', 
        'MOVE_BOX', 
        'PICK_MOVE', -- Legacy
        
        -- Process Types
        'PACK', 
        'ADJUST', 
        'AUDIT', 
        'INBOUND_BULK',
        
        -- New Types
        'RESERVE', 
        'RELEASE',
        
        -- Specific Export Types (if used)
        'EXPORT_SALE',
        'EXPORT_GIFT'
    ));
END $$;
