-- Run this in Supabase SQL Editor to allow 'LOCKED' status for boxes
ALTER TABLE boxes DROP CONSTRAINT IF EXISTS boxes_status_check;
ALTER TABLE boxes ADD CONSTRAINT boxes_status_check CHECK (status IN ('OPEN', 'CLOSED', 'FULL', 'LOCKED', 'SHIPPED'));

-- Optional: If status was an ENUM, you would use ALTER TYPE, but based on the error it's a CHECK constraint on a TEXT column.
