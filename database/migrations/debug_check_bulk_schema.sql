
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'bulk_inventory';

SELECT view_definition 
FROM information_schema.views 
WHERE table_name = 'view_product_availability';
