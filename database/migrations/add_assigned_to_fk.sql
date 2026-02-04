
-- Add Foreign Key for assigned_to in picking_jobs if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.table_constraints 
        WHERE constraint_name = 'picking_jobs_assigned_to_fkey'
    ) THEN
        ALTER TABLE picking_jobs
        ADD CONSTRAINT picking_jobs_assigned_to_fkey
        FOREIGN KEY (assigned_to) REFERENCES users(id);
    END IF;
END $$;
