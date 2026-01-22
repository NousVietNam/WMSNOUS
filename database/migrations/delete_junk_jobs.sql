-- Delete junk picking jobs
-- These are the jobs with codes: JOB-1F93CC58, JOB-O0B97AAA, JOB-8CD37D93, JOB-COB7C91F

DELETE FROM picking_tasks 
WHERE job_id IN (
    SELECT id FROM picking_jobs 
    WHERE code IN ('JOB-1F93CC58', 'JOB-O0B97AAA', 'JOB-8CD37D93', 'JOB-COB7C91F')
);

DELETE FROM picking_jobs 
WHERE code IN ('JOB-1F93CC58', 'JOB-O0B97AAA', 'JOB-8CD37D93', 'JOB-COB7C91F');
