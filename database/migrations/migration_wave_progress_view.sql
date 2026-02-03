
-- View: Wave Progress
-- Description: Calculates total and completed tasks for each wave
CREATE OR REPLACE VIEW view_wave_progress AS
SELECT 
    w.id as wave_id,
    count(pt.id) as total_tasks,
    count(pt.id) FILTER (WHERE pt.status = 'COMPLETED') as completed_tasks
FROM pick_waves w
LEFT JOIN picking_jobs pj ON w.id = pj.wave_id
LEFT JOIN picking_tasks pt ON pj.id = pt.job_id
GROUP BY w.id;
