-- Fix Picking Jobs Constraint
ALTER TABLE "picking_jobs" DROP CONSTRAINT IF EXISTS "picking_jobs_status_check";
ALTER TABLE "picking_jobs" ADD CONSTRAINT "picking_jobs_status_check" 
CHECK (status IN ('OPEN', 'IN_PROGRESS', 'COMPLETED', 'DONE', 'CANCELLED', 'PENDING'));

-- Fix Picking Tasks Constraint (Ensure COMPLETED is allowed)
ALTER TABLE "picking_tasks" DROP CONSTRAINT IF EXISTS "picking_tasks_status_check";
ALTER TABLE "picking_tasks" ADD CONSTRAINT "picking_tasks_status_check"
CHECK (status IN ('PENDING', 'ASSIGNED', 'IN_PROGRESS', 'PICKED', 'SKIPPED', 'COMPLETED', 'CANCELLED'));
