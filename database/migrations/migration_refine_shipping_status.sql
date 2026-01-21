-- 1. Relax Constraints to allow 'SHIPPED'
ALTER TABLE "picking_jobs" DROP CONSTRAINT IF EXISTS "picking_jobs_status_check";
ALTER TABLE "picking_jobs" ADD CONSTRAINT "picking_jobs_status_check" 
CHECK (status IN ('OPEN', 'IN_PROGRESS', 'COMPLETED', 'DONE', 'CANCELLED', 'PENDING', 'SHIPPED'));

-- 2. Update RPC to set status to 'SHIPPED'
CREATE OR REPLACE FUNCTION ship_manual_job(p_job_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_job RECORD;
    v_outbox_codes TEXT[];
    v_box_ids UUID[];
    v_tx_count INT := 0;
BEGIN
    -- 1. Verify Job
    SELECT * INTO v_job FROM picking_jobs WHERE id = p_job_id FOR UPDATE;

    IF v_job IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Không tìm thấy Job');
    END IF;

    -- If already SHIPPED, block.
    IF v_job.status = 'SHIPPED' THEN
         RETURN jsonb_build_object('success', false, 'error', 'Job này đã xuất kho rồi');
    END IF;

    -- Fail-safe for "Stuck" COMPLETED jobs (Phantom state)
    -- If it is COMPLETED, we check if it has transactions.
    IF v_job.status = 'COMPLETED' THEN
        PERFORM 1 FROM transactions WHERE reference_id = p_job_id LIMIT 1;
        IF FOUND THEN
            -- It has transactions, so it IS shipped but status is wrong.
            -- We just update status and return success.
            UPDATE picking_jobs SET status = 'SHIPPED' WHERE id = p_job_id;
            RETURN jsonb_build_object('success', true, 'message', 'Cập nhật trạng thái thành Đã Xuất', 'tx_count', 0);
        END IF;
        -- If NOT FOUND, proceed to ship.
    END IF;

    -- 2. Find Outboxes used in this job
    SELECT array_agg(DISTINCT b.id) INTO v_box_ids
    FROM picking_tasks t
    JOIN boxes b ON b.code = t.outbox_code
    WHERE t.job_id = p_job_id AND b.type = 'OUTBOX';

    IF v_box_ids IS NOT NULL AND array_length(v_box_ids, 1) > 0 THEN
        -- 3. Transactions
        INSERT INTO transactions (type, entity_type, quantity, sku, reference_id, from_box_id, note, created_at)
        SELECT 
            'MISCELLANEOUS_ISSUE',
            'ITEM',
            -i.quantity,
            p.sku,
            p_job_id,
            i.box_id,
            'Xuất kho Manual Job: ' || v_job.id,
            NOW()
        FROM inventory_items i
        JOIN products p ON i.product_id = p.id
        WHERE i.box_id = ANY(v_box_ids);

        GET DIAGNOSTICS v_tx_count = ROW_COUNT;

        -- 4. Delete Inventory
        DELETE FROM inventory_items WHERE box_id = ANY(v_box_ids);

        -- 5. Update Boxes
        UPDATE boxes SET status = 'SHIPPED' WHERE id = ANY(v_box_ids);
    END IF;

    -- 6. Update Job (NEW: Set to SHIPPED)
    UPDATE picking_jobs SET status = 'SHIPPED' WHERE id = p_job_id;

    RETURN jsonb_build_object('success', true, 'message', 'Xuất kho thành công', 'tx_count', v_tx_count);

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- 3. Update existing data (Data Patch)
-- Any job that is COMPLETED and has transactions should be SHIPPED
UPDATE picking_jobs pj
SET status = 'SHIPPED'
WHERE status = 'COMPLETED'
AND EXISTS (
    SELECT 1 FROM transactions t WHERE t.reference_id = pj.id
);
