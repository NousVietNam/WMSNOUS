
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'picking_tasks';

SELECT constraint_name, check_clause
FROM information_schema.check_constraints
WHERE constraint_name LIKE 'picking_tasks%';
