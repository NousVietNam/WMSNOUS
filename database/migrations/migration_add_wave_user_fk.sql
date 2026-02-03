
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.table_constraints 
        WHERE constraint_name = 'pick_waves_created_by_fkey'
    ) THEN
        ALTER TABLE pick_waves
        ADD CONSTRAINT pick_waves_created_by_fkey
        FOREIGN KEY (created_by)
        REFERENCES users(id);
    END IF;
END $$;
