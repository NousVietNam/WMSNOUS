SELECT pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'outbound_orders'::regclass
AND conname = 'outbound_orders_status_check';
