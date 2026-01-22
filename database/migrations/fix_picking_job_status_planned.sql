-- Fix Picking Jobs Constraint (Comprehensive Fix)

-- 1. Drop the constraint to ensure we can modify data/schema
ALTER TABLE "picking_jobs" DROP CONSTRAINT IF EXISTS "picking_jobs_status_check";

-- 2. Clean up any invalid statuses that might have slipped in (Sanitize Data)
-- If a row has a status that is NOT in our allowed list, reset it to 'PENDING'
-- This fixes the "check constraint is violated by some row" error.
UPDATE "picking_jobs" 
SET status = 'PENDING' 
WHERE status NOT IN ('PLANNED', 'OPEN', 'IN_PROGRESS', 'COMPLETED', 'DONE', 'CANCELLED', 'PENDING');

-- 3. Re-apply the constraint with 'PLANNED' included
ALTER TABLE "picking_jobs" ADD CONSTRAINT "picking_jobs_status_check" 
CHECK (status IN ('PLANNED', 'OPEN', 'IN_PROGRESS', 'COMPLETED', 'DONE', 'CANCELLED', 'PENDING'));
