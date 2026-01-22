SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'outbound_orders'::regclass
AND contype = 'c';
