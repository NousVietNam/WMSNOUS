SELECT 
    b.id, b.code, b.status, b.outbound_order_id, b.type,
    l.code as location_code
FROM boxes b
LEFT JOIN locations l ON b.location_id = l.id
WHERE b.code = 'BOX-TEST-0002';
