-- View for Mobile Picking Job Progress
CREATE OR REPLACE VIEW view_picking_job_progress AS
SELECT 
    job_id,
    COUNT(*) as total_tasks,
    SUM(CASE WHEN status = 'PICKED' THEN 1 ELSE 0 END) as completed_tasks
FROM picking_tasks
GROUP BY job_id;
