
-- 1. Enable Zalo Webhook Table (Optional, or just use Edge Function later)
-- For now, let's focus on the Logic changes in Postgres first.

-- 2. Add 'PENDING_APPROVAL' status to picking_tasks
ALTER TABLE picking_tasks DROP CONSTRAINT IF EXISTS picking_tasks_status_check;
ALTER TABLE picking_tasks ADD CONSTRAINT picking_tasks_status_check 
CHECK (status IN ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'PENDING_APPROVAL'));

-- 3. Update Picking Exceptions Table for Zalo Interaction
DROP VIEW IF EXISTS view_picking_exceptions;
ALTER TABLE picking_exceptions 
ADD COLUMN IF NOT EXISTS zalo_msg_id TEXT, -- To track Zalo message ID if needed
ADD COLUMN IF NOT EXISTS zalo_msg_id TEXT, -- To track Zalo message ID if needed
ADD COLUMN IF NOT EXISTS approved_replacement_box_id UUID REFERENCES boxes(id), -- If Approved with Replacement
ADD COLUMN IF NOT EXISTS resolution_note TEXT; -- Admin Note on resolution

CREATE OR REPLACE VIEW view_picking_exceptions AS
SELECT 
    pe.*,
    p.sku as product_sku,
    p.name as product_name,
    p.image_url as product_image,
    b.code as box_code,
    u.name as user_name,
    pj.code as job_code,
    oo.code as order_code,
    oo.id as order_id
FROM picking_exceptions pe
LEFT JOIN products p ON pe.product_id = p.id
LEFT JOIN boxes b ON pe.box_id = b.id
LEFT JOIN public.users u ON pe.user_id = u.id
LEFT JOIN picking_jobs pj ON pe.job_id = pj.id
LEFT JOIN outbound_orders oo ON pj.outbound_order_id = oo.id;

-- 4. RPC: Request Approval (Nhan vien bao thieu)
CREATE OR REPLACE FUNCTION request_picking_approval(
    p_task_id UUID,
    p_actual_qty INT,
    p_reason TEXT,
    p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_task RECORD;
    v_exception_id UUID;
BEGIN
    SELECT * INTO v_task FROM picking_tasks WHERE id = p_task_id;
    IF v_task.status = 'COMPLETED' THEN 
        RETURN jsonb_build_object('success', false, 'error', 'Task already completed'); 
    END IF;

    -- Update Task to PENDING_APPROVAL so User cannot proceed
    UPDATE picking_tasks 
    SET status = 'PENDING_APPROVAL' 
    WHERE id = p_task_id;

    -- Create Exception Record
    INSERT INTO picking_exceptions (
        job_id, task_id, product_id, box_id, user_id,
        exception_type, quantity_expected, quantity_actual, note, status
    ) VALUES (
        v_task.job_id, p_task_id, v_task.product_id, v_task.box_id, p_user_id,
        'SHORTAGE', v_task.quantity, p_actual_qty, p_reason, 'OPEN'
    ) RETURNING id INTO v_exception_id;

    -- Here we would trigger Zalo Notification via Supabase Edge Function (Database Webhook)
    -- notification_queue -> trigger -> edge function -> Zalo API

    RETURN jsonb_build_object('success', true, 'exception_id', v_exception_id);
END;
$$;

-- 5. RPC: Decision 1 - Reject Shortage (Found Item / User Error)
-- "Coi như không có gì xảy ra", nhân viên phải đi lấy tiếp.
CREATE OR REPLACE FUNCTION admin_reject_shortage(
    p_exception_id UUID,
    p_admin_id UUID,
    p_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_ex RECORD;
BEGIN
    SELECT * INTO v_ex FROM picking_exceptions WHERE id = p_exception_id;
    IF v_ex IS NULL OR v_ex.status <> 'OPEN' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid exception');
    END IF;

    -- 1. Close Exception
    UPDATE picking_exceptions 
    SET status = 'IGNORED', resolved_by = p_admin_id, resolved_at = NOW(), resolution_note = p_note
    WHERE id = p_exception_id;

    -- 2. Unlock Task for User
    -- Revert status to PENDING/IN_PROGRESS
    UPDATE picking_tasks 
    SET status = 'PENDING' 
    WHERE id = v_ex.task_id;

    RETURN jsonb_build_object('success', true);
END;
$$;

-- 6. RPC: Decision 2 - Approve with Replacement (Change Box)
-- "Duyệt thay đổi sang thùng khác" (Thùng A thiếu -> Lấy Thùng B)
-- Impacts: 
-- - Release allocation of Old Box
-- - Allocate New Box (or check avail)
-- - Update Task Box ID
-- - Close Exception
-- - Log "Missing" transaction for Old Box
CREATE OR REPLACE FUNCTION admin_approve_replacement(
    p_exception_id UUID,
    p_new_box_id UUID,
    p_admin_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_ex RECORD;
    v_task RECORD;
    v_new_box_code TEXT;
    v_missing_qty INT;
BEGIN
    SELECT * INTO v_ex FROM picking_exceptions WHERE id = p_exception_id;
    IF v_ex IS NULL OR v_ex.status <> 'OPEN' THEN RETURN jsonb_build_object('success', false, 'error', 'Invalid exception'); END IF;
    
    SELECT * INTO v_task FROM picking_tasks WHERE id = v_ex.task_id;
    v_missing_qty := v_ex.quantity_expected - v_ex.quantity_actual; 
    -- Actually for replacement, we usually replace the whole remaining/missing part. 
    -- Implementation: We assume we replace the WHOLE picking task source to the new box for simplicity, 
    -- OR we might split the task.
    -- SIMPLE APPROACH: Move the WHOLE pending task to new box.
    -- If user already picked partial?
    -- If user picked 3/5, and we replace 2. Do we create a new task?
    -- Decision: Update the Picking Task Box ID. 
    -- But if user ALREADY picked 3 from Box A physically? 
    -- If they have 3 in hand, they just need 2 from Box B.
    -- This gets complex. Let's assume simpler: "User requests approval" means they picked NOTHING yet or what they picked is held.
    -- If they picked 3, they are holding 3. We split 2 to Box B.
    
    -- Let's support the Split.
    -- If v_ex.quantity_actual > 0:
    --    We confirm the 3 from Box A immediately (Partial Complete).
    --    We create NEW Task for 2 from Box B.
    -- If v_ex.quantity_actual == 0:
    --    We just update the current Task to Box B.

    -- Validation New Box
    SELECT code INTO v_new_box_code FROM boxes WHERE id = p_new_box_id;
    IF v_new_box_code IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Box invalid'); END IF;

    -- 1. Handle Old Box (The missing part)
    -- Log "MISSING" transaction for the Gap quantity at Old Box
    IF v_missing_qty > 0 THEN
        INSERT INTO transactions (type, entity_type, sku, quantity, from_box_id, user_id, notes, created_at)
        VALUES ('ADJUSTMENT', 'ITEM', (SELECT sku FROM products WHERE id=v_task.product_id), -v_missing_qty, v_ex.box_id, p_admin_id, 'Shortage reported - Replacement approved', NOW());
        
        -- Also reduce the physical quantity record if it exists (Shrinkage) or just rely on adjust?
        -- Let's do a proper shrinkage adjustment later? 
        -- User said: "Ngoài ra tạo 1 giao dịch ghi nhận kho hàng thiếu" -> Done (Transaction).
    END IF;

    -- 2. Handle Task
    IF v_ex.quantity_actual > 0 THEN
       -- Case: Picked 3, Missing 2.
       -- Confirm the 3.
       -- (Must call confirm logic internal or manually update).
       -- Let's clone logic: Deduct 3 from Old Box, Add to Outbox (Wait... we don't know Outbox ID here! User hasn't scanned it or it's in session).
       -- CRITICAL: Admin cannot confirm the "Put to Outbox" step because Admin is not holding the scanner.
       -- SOLUTION: We do NOT confirm the 3. We split the task.
       -- Task 1: Qty 3, Box A. Status: PENDING (User to resume and confirm).
       -- Task 2: Qty 2, Box B. Status: PENDING (New task).
       
       -- Update current task to 3.
       UPDATE picking_tasks SET quantity = v_ex.quantity_actual, status = 'PENDING' WHERE id = v_task.id;
       
       -- Create new task for 2 at Box B.
       INSERT INTO picking_tasks (job_id, product_id, quantity, box_id, status, created_at)
       VALUES (v_task.job_id, v_task.product_id, v_missing_qty, p_new_box_id, 'PENDING', NOW());
       
    ELSE
       -- Case: Picked 0. Just swap box.
       UPDATE picking_tasks 
       SET box_id = p_new_box_id, status = 'PENDING' 
       WHERE id = v_task.id;
    END IF;

    -- 3. Release Allocation of Old Box (for the missing part)
    UPDATE inventory_items 
    SET allocated_quantity = GREATEST(0, COALESCE(allocated_quantity, 0) - v_missing_qty)
    WHERE box_id = v_ex.box_id AND product_id = v_task.product_id;

    -- 4. Allocate New Box (Try best effort)
    -- ... (Optional, or leave for runtime check)

    -- 5. Close Exception
    UPDATE picking_exceptions 
    SET status = 'RESOLVED', resolved_by = p_admin_id, resolved_at = NOW(), resolution_note = 'Replacement Approved: ' || v_new_box_code, approved_replacement_box_id = p_new_box_id
    WHERE id = p_exception_id;

    RETURN jsonb_build_object('success', true);
END;
$$;

-- 7. RPC: Decision 3 - Confirm Shortage (Cut Order)
-- "Duyệt không thấy hàng"
-- Impacts:
-- - Confirm partial pick (if any)
-- - Cancel missing part
-- - Log Missing Transaction (Shrinkage)
CREATE OR REPLACE FUNCTION admin_confirm_shortage(
    p_exception_id UUID,
    p_admin_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_ex RECORD;
    v_task RECORD;
    v_missing_qty INT;
BEGIN
    SELECT * INTO v_ex FROM picking_exceptions WHERE id = p_exception_id;
    IF v_ex IS NULL OR v_ex.status <> 'OPEN' THEN RETURN jsonb_build_object('success', false, 'error', 'Invalid exception'); END IF;
    
    SELECT * INTO v_task FROM picking_tasks WHERE id = v_ex.task_id;
    v_missing_qty := v_ex.quantity_expected - v_ex.quantity_actual;

    -- 1. Log Transaction (Shrinkage for Missing Part)
    IF v_missing_qty > 0 THEN
        INSERT INTO transactions (type, entity_type, sku, quantity, from_box_id, user_id, notes, created_at)
        VALUES ('ADJUSTMENT', 'ITEM', (SELECT sku FROM products WHERE id=v_task.product_id), -v_missing_qty, v_ex.box_id, p_admin_id, 'Shortage Confirmed by Admin', NOW());
        
        -- Release Allocation on Source
        UPDATE inventory_items 
        SET allocated_quantity = GREATEST(0, COALESCE(allocated_quantity, 0) - v_missing_qty)
        WHERE box_id = v_ex.box_id AND product_id = v_task.product_id;
    END IF;

    -- 2. Update Task
    -- We can't "Complete" the task for the user remotely because they might need to confirm "Put to Outbox" for the ACTUAL part.
    -- So we reduce the Task Quantity to the Actual Quantity.
    -- If Actual is 0, we can Complete/Cancel it.
    
    IF v_ex.quantity_actual > 0 THEN
        -- Reduce task to what is available. User will then confirm this smaller amount.
        UPDATE picking_tasks 
        SET quantity = v_ex.quantity_actual, 
            status = 'PENDING' -- Unlock for user to finish
        WHERE id = v_task.id;
    ELSE
        -- Nothing picked. Cancel task.
        UPDATE picking_tasks 
        SET status = 'CANCELLED', -- Or COMPLETED with 0? CANCELLED is better semantically.
            picked_quantity = 0
        WHERE id = v_task.id;
        
        -- We also need to update Order Items to reflect "Lost" if we want to track unfulfilled?
        -- For now, CANCELLED task implies it wasn't picked.
    END IF;

    -- 3. Close Exception
    UPDATE picking_exceptions 
    SET status = 'RESOLVED', resolved_by = p_admin_id, resolved_at = NOW(), resolution_note = 'Shortage Confirmed'
    WHERE id = p_exception_id;

    RETURN jsonb_build_object('success', true);
END;
$$;
