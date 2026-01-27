SELECT 
    t.table_name, 
    c.column_name, 
    c.data_type 
FROM 
    information_schema.columns c 
JOIN 
    information_schema.tables t ON c.table_name = t.table_name 
WHERE 
    t.table_schema = 'public' 
    AND t.table_name IN ('inbound_orders', 'boxes', 'box_items', 'inventory_transactions');
