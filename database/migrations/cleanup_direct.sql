-- Direct SQL to cleanup old jobs and reset orders
-- This bypasses Supabase client limitations

DO $$
DECLARE
    v_job_ids UUID[];
    v_deleted_count INT;
BEGIN
    -- Get IDs of PENDING jobs
    SELECT ARRAY_AGG(id) INTO v_job_ids
    FROM picking_jobs
    WHERE status = 'PENDING';
    
    RAISE NOTICE 'Found % PENDING jobs', ARRAY_LENGTH(v_job_ids, 1);
    
    -- Delete shipments referencing these jobs
    DELETE FROM outbound_shipments
    WHERE picking_job_id = ANY(v_job_ids);
    
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RAISE NOTICE 'Deleted % shipments', v_deleted_count;
    
    -- Delete picking tasks
    DELETE FROM picking_tasks
    WHERE job_id = ANY(v_job_ids);
    
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RAISE NOTICE 'Deleted % picking tasks', v_deleted_count;
    
    -- Delete picking jobs
    DELETE FROM picking_jobs
    WHERE id = ANY(v_job_ids);
    
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RAISE NOTICE 'Deleted % picking jobs', v_deleted_count;
    
    -- Reset ALLOCATED orders to APPROVED
    UPDATE outbound_orders
    SET status = 'APPROVED'
    WHERE status = 'ALLOCATED';
    
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RAISE NOTICE 'Reset % orders to APPROVED', v_deleted_count;
    
    RAISE NOTICE 'Cleanup complete!';
END $$;

-- Verify cleanup
SELECT 'PENDING jobs remaining:' as info, COUNT(*) as count FROM picking_jobs WHERE status = 'PENDING'
UNION ALL
SELECT 'ALLOCATED orders remaining:', COUNT(*) FROM outbound_orders WHERE status = 'ALLOCATED';
