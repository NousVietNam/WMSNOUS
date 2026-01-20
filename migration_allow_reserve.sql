-- Migration: Update Transactions Check Constraint 
-- Reason: To allow 'RESERVE' transaction type for Picking Uploads.

DO $$ 
BEGIN
    -- 1. Try to drop the existing constraint
    BEGIN
        ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_type_check;
    EXCEPTION
        WHEN undefined_object THEN
            RAISE NOTICE 'Constraint transactions_type_check not found';
    END;
    
    -- 2. Add the updated constraint including RESERVE
    ALTER TABLE transactions 
    ADD CONSTRAINT transactions_type_check 
    CHECK (type IN (
        'IMPORT', 
        'EXPORT', 
        'SHIP', 
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
        'EXPORT_SALE',
        'EXPORT_GIFT',
        'PICK'
    ));
    
    RAISE NOTICE 'Updated transactions_type_check to include RESERVE';
END $$;
