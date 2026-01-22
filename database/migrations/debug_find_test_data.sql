-- Find valid orders and boxes for testing
SELECT 
    o.code as order_code, 
    o.status as order_status, 
    o.id as order_id,
    b.code as box_code, 
    b.status as box_status,
    b.outbound_order_id as box_linked_order_id
FROM outbound_orders o
LEFT JOIN boxes b ON b.outbound_order_id = o.id
WHERE o.status IN ('ALLOCATED', 'PICKING', 'PACKED')
LIMIT 5;
