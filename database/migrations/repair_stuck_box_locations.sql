-- Migration: Repair Stuck Box Locations
-- Description: Finds all boxes that are marked SHIPPED but still have a Location (e.g., GATE-OUT) and clears them.
-- This fixes data for orders shipped before the logic was perfected.

DO $$ 
DECLARE
    v_count INT;
BEGIN
    -- 1. Count affected boxes
    SELECT COUNT(*) INTO v_count 
    FROM boxes 
    WHERE status = 'SHIPPED' AND location_id IS NOT NULL;

    RAISE NOTICE 'Found % stuck boxes. Fixing...', v_count;

    -- 2. Clear Location for SHIPPED boxes
    UPDATE boxes 
    SET location_id = NULL,
        updated_at = NOW()
    WHERE status = 'SHIPPED' AND location_id IS NOT NULL;

    RAISE NOTICE 'Fixed locations for % boxes.', v_count;
END $$;
