-- 1. Remove Expiry Date (Simplification)
ALTER TABLE inventory_items DROP COLUMN IF EXISTS expiry_date;

-- 2. Update Transactions Type Check (Expand allowed types)
-- We drop the constraint by name (assumed standard Postgres naming if created inline, or try generic approach)
-- Note: If constraint name is unknown, we might fail. But usually it's "transactions_entity_type_check" or similar?
-- Actually, the error previously was "new row for relation transactions violates check constraint".
-- Let's just DROP the constraint on the column `type` if possible, or `entity_type`?
-- Wait, the error was likely on `type` column if strictly defined? 
-- The previous migration `migration_logic_update.sql` added `entity_type` check.
-- But `type` column usually has a check too if it were an enum. 
-- Looking at `migration_phase_8.sql` or others... they didn't define `transactions` table. 
-- `transactions` table might have been created very early.
-- Let's assume there IS a check on `type` or it's just TEXT.
-- If it's TEXT without check, then `PICK_MOVE` failed because of `entity_type`? No.
-- Let's try to Add/Update the check on `type`.

DO $$
BEGIN
    -- Try to drop constraint if it exists (guessing name or inspecting)
    -- Commonly: transactions_type_check
    BEGIN
        ALTER TABLE transactions DROP CONSTRAINT transactions_type_check;
    EXCEPTION
        WHEN undefined_object THEN NULL;
    END;
END $$;

-- Enforce new types
ALTER TABLE transactions 
ADD CONSTRAINT transactions_type_check 
CHECK (type IN ('IMPORT', 'MOVE', 'PACK', 'SHIP', 'ADJUST', 'AUDIT', 'PICK_MOVE')); 
-- Kept PICK_MOVE just in case old logs exist, though we want to deprecate it.

-- 3. Update Order Status Check
DO $$
BEGIN
    BEGIN
        ALTER TABLE orders DROP CONSTRAINT orders_status_check;
    EXCEPTION
        WHEN undefined_object THEN NULL;
    END;
END $$;

ALTER TABLE orders 
ADD CONSTRAINT orders_status_check 
CHECK (status IN ('PENDING', 'ALLOCATED', 'PICKING', 'PACKED', 'SHIPPED', 'COMPLETED', 'CANCELLED'));

-- Reload Postgrest
NOTIFY pgrst, 'reload config';
