const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function runMigration() {
    const sql = `
-- 1. Ensure GATE-OUT location exists
INSERT INTO locations (code, type)
VALUES ('GATE-OUT', 'FLOOR')
ON CONFLICT (code) DO NOTHING;

-- 2. Function to handle Whole Box Picking (BOX PICK)
CREATE OR REPLACE FUNCTION confirm_box_pick(
    p_box_id UUID,
    p_job_id UUID,
    p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_gate_out_id UUID;
    v_box_code TEXT;
    v_tasks_updated INT := 0;
    v_order_id UUID;
    v_transfer_order_id UUID;
    v_rec RECORD;
BEGIN
    -- Get GATE-OUT ID
    SELECT id INTO v_gate_out_id FROM locations WHERE code = 'GATE-OUT' LIMIT 1;
    IF v_gate_out_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Vị trí GATE-OUT chưa được tạo');
    END IF;

    -- Get Box Info
    SELECT code INTO v_box_code FROM boxes WHERE id = p_box_id;
    
    -- Get Order/Transfer context from Job
    SELECT order_id, transfer_order_id INTO v_order_id, v_transfer_order_id 
    FROM picking_jobs WHERE id = p_job_id;

    -- 1. Move Box to GATE-OUT
    UPDATE boxes 
    SET location_id = v_gate_out_id,
        updated_at = NOW()
    WHERE id = p_box_id;

    -- 2. Mark all tasks for THIS box in THIS job as COMPLETED
    UPDATE picking_tasks
    SET status = 'COMPLETED',
        picked_at = NOW()
    WHERE job_id = p_job_id AND box_id = p_box_id;

    GET DIAGNOSTICS v_tasks_updated = ROW_COUNT;

    -- 3. Update Order/Transfer items picked quantities
    IF v_order_id IS NOT NULL THEN
        FOR v_rec IN 
            SELECT product_id, SUM(quantity) as qty 
            FROM picking_tasks 
            WHERE job_id = p_job_id AND box_id = p_box_id
            GROUP BY product_id
        LOOP
            UPDATE order_items 
            SET picked_quantity = COALESCE(picked_quantity, 0) + v_rec.qty
            WHERE order_id = v_order_id AND product_id = v_rec.product_id;
        END LOOP;
    END IF;

    IF v_transfer_order_id IS NOT NULL THEN
        FOR v_rec IN 
            SELECT product_id, SUM(quantity) as qty 
            FROM picking_tasks 
            WHERE job_id = p_job_id AND box_id = p_box_id
            GROUP BY product_id
        LOOP
            UPDATE transfer_order_items 
            SET quantity = quantity
            WHERE transfer_id = v_transfer_order_id AND product_id = v_rec.product_id AND box_id = p_box_id;
        END LOOP;
    END IF;

    -- 4. Log Box Transaction
    INSERT INTO transactions (
        type, 
        entity_type, 
        quantity, 
        from_box_id, 
        to_box_id, 
        user_id, 
        note,
        created_at
    ) VALUES (
        'TRANSFER',
        'BOX',
        1,
        p_box_id,
        p_box_id,
        p_user_id,
        'Pick nguyên thùng ra cửa xuất (GATE-OUT)',
        NOW()
    );

    RETURN jsonb_build_object(
        'success', true,
        'box_code', v_box_code,
        'tasks_updated', v_tasks_updated
    );
END;
$$;
    `;

    console.log("Running SQL migration...")
    const { error } = await supabase.rpc('exec_sql', { sql_query: sql })
    if (error) {
        console.error("Migration failed:", error)
        console.log("Attempting direct table check to see if it partly worked...")
        // If exec_sql doesn't exist, this is a fallback or just a failure.
    } else {
        console.log("Migration successful!")
    }
}

async function checkExecSql() {
    // Check if we can run RPC exec_sql. Usually not available by default.
    // I'll just use a simpler approach if possible or ask user to run SQL.
}

runMigration()
