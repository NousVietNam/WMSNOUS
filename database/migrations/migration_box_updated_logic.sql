-- 1. Ensure updated_at column exists in boxes
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'boxes' AND column_name = 'updated_at') THEN
        ALTER TABLE boxes ADD COLUMN updated_at TIMESTAMPTZ DEFAULT now();
    END IF;
END $$;

-- 2. Create Trigger Function
CREATE OR REPLACE FUNCTION update_box_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    -- Update timestamp for any transaction NOT related to creation
    -- Adjust filter 'CREATE' if you use different codes like 'INITIAL'
    IF NEW.type NOT ILIKE '%CREATE%' THEN
        -- Update FROM box
        IF NEW.from_box_id IS NOT NULL THEN
            UPDATE boxes SET updated_at = NEW.created_at WHERE id = NEW.from_box_id;
        END IF;

        -- Update TO box
        IF NEW.to_box_id IS NOT NULL THEN
            UPDATE boxes SET updated_at = NEW.created_at WHERE id = NEW.to_box_id;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Create Trigger
DROP TRIGGER IF EXISTS trg_update_box_timestamp ON transactions;

CREATE TRIGGER trg_update_box_timestamp
AFTER INSERT ON transactions
FOR EACH ROW
EXECUTE FUNCTION update_box_timestamp();

-- 4. Backfill Data (One-time fix)
WITH box_activity AS (
    SELECT 
        box_id, 
        MAX(created_at) as last_tx
    FROM (
        SELECT from_box_id as box_id, created_at FROM transactions WHERE from_box_id IS NOT NULL AND type NOT ILIKE '%CREATE%'
        UNION ALL
        SELECT to_box_id as box_id, created_at FROM transactions WHERE to_box_id IS NOT NULL AND type NOT ILIKE '%CREATE%'
    ) sub
    GROUP BY box_id
)
UPDATE boxes b
SET updated_at = ba.last_tx
FROM box_activity ba
WHERE b.id = ba.box_id;
