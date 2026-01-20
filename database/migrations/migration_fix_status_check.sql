
-- Fix status check constraint for picking_tasks
ALTER TABLE picking_tasks 
DROP CONSTRAINT IF EXISTS picking_tasks_status_check;

ALTER TABLE picking_tasks 
ADD CONSTRAINT picking_tasks_status_check 
CHECK (status IN ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'SKIPPED'));
