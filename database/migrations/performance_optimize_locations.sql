
-- Performance Optimization: Location List
-- Eliminate N+1 queries by pre-calculating last_update in the locations table

-- 1. Add last_update column to locations
ALTER TABLE locations ADD COLUMN IF NOT EXISTS last_update TIMESTAMPTZ;

-- 2. Populate initial values from transactions
UPDATE locations l
SET last_update = (
    SELECT MAX(created_at)
    FROM transactions t
    WHERE t.from_location_id = l.id OR t.to_location_id = l.id
);

-- 3. Create or replace the function to update locations.last_update
CREATE OR REPLACE FUNCTION update_location_last_update()
RETURNS TRIGGER AS $$
BEGIN
    -- Update source location
    IF NEW.from_location_id IS NOT NULL THEN
        UPDATE locations
        SET last_update = NEW.created_at
        WHERE id = NEW.from_location_id;
    END IF;

    -- Update destination location
    IF NEW.to_location_id IS NOT NULL THEN
        UPDATE locations
        SET last_update = NEW.created_at
        WHERE id = NEW.to_location_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4. Create trigger on transactions table
DROP TRIGGER IF EXISTS tr_update_location_last_update ON transactions;
CREATE TRIGGER tr_update_location_last_update
AFTER INSERT ON transactions
FOR EACH ROW
EXECUTE FUNCTION update_location_last_update();
