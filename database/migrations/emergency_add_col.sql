
DO $$
BEGIN
    -- Check if table exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'bulk_inventory') THEN
        RAISE EXCEPTION 'Table bulk_inventory does not exist!';
    END IF;

    -- Add column if not exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bulk_inventory' AND column_name = 'allocated_quantity') THEN
        ALTER TABLE bulk_inventory ADD COLUMN allocated_quantity INTEGER DEFAULT 0;
        RAISE NOTICE 'Column allocated_quantity added.';
    ELSE
        RAISE NOTICE 'Column allocated_quantity already exists.';
    END IF;
END $$;
