-- Add ASSIGNED to picking_jobs status
ALTER TABLE picking_jobs DROP CONSTRAINT IF EXISTS picking_jobs_status_check;
ALTER TABLE picking_jobs ADD CONSTRAINT picking_jobs_status_check 
    CHECK (status IN ('PENDING', 'PLANNED', 'OPEN', 'ASSIGNED', 'IN_PROGRESS', 'PICKING', 'COMPLETED', 'PACKED', 'SHIPPED', 'CANCELLED'));
