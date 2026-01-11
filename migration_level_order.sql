-- Add Level Order Column
ALTER TABLE locations
ADD COLUMN IF NOT EXISTS level_order INTEGER DEFAULT 0;

-- Notify change
NOTIFY pgrst, 'reload config';
