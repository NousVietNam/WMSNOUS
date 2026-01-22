SELECT 
    proname, 
    proargnames, 
    proargtypes::regtype[] 
FROM pg_proc 
WHERE proname = 'allocate_outbound';
