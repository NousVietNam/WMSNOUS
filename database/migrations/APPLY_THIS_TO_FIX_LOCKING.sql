-- =====================================================
-- Migration: Update RPCs to Lock Boxes on Approval (Corrected)
-- Description: When an outbound order is approved:
--              1. Update linked boxes status to 'LOCKED'
--              2. Update linked boxes outbound_order_id to the current order
--              Unapproving reverses this (OPEN, NULL).
-- =====================================================

-- 1. APPROVE FUNCTION UPDATE
CREATE OR REPLACE FUNCTION approve_outbound(p_order_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_order RECORD;
    v_item RECORD;
    v_missing JSONB := '[]'::JSONB;
    v_available INT;
BEGIN
    SELECT * INTO v_order FROM outbound_orders WHERE id = p_order_id;
    
    IF v_order IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Không tìm thấy đơn hàng');
    END IF;

    IF v_order.is_approved THEN
         RETURN jsonb_build_object('success', false, 'error', 'Đơn hàng đã được duyệt rồi');
    END IF;

    -- Check availability for grouped items
    FOR v_item IN 
        SELECT 
            product_id, 
            SUM(quantity) as quantity,
            (SELECT sku FROM products WHERE id = product_id) as sku
        FROM outbound_order_items 
        WHERE order_id = p_order_id 
        GROUP BY product_id 
    LOOP
        -- Get current availability
        SELECT available_quantity INTO v_available
        FROM view_product_availability 
        WHERE product_id = v_item.product_id;
        
        -- If total requested > available, add to missing list
        IF COALESCE(v_available, 0) < v_item.quantity THEN
             v_missing := v_missing || jsonb_build_object(
                'product_id', v_item.product_id,
                'sku', v_item.sku,
                'requested', v_item.quantity,
                'available', COALESCE(v_available, 0)
             );
        END IF;
    END LOOP;

    -- If missing items, return error details
    IF jsonb_array_length(v_missing) > 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Không đủ tồn kho khả dụng', 'missing', v_missing);
    END IF;

    -- NEW LOGIC: Lock Linked Boxes AND Set outbound_order_id
    UPDATE boxes
    SET status = 'LOCKED',
        outbound_order_id = p_order_id,
        updated_at = NOW()
    WHERE id IN (
        SELECT DISTINCT from_box_id 
        FROM outbound_order_items 
        WHERE order_id = p_order_id 
          AND from_box_id IS NOT NULL
    );

    -- Approve
    UPDATE outbound_orders 
    SET is_approved = TRUE, 
        approved_at = NOW(), 
        approved_by = auth.uid() 
    WHERE id = p_order_id;

    RETURN jsonb_build_object('success', true);
END;
$$;

-- 2. UNAPPROVE FUNCTION UPDATE
CREATE OR REPLACE FUNCTION unapprove_outbound(p_order_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_order RECORD;
BEGIN
    SELECT * INTO v_order FROM outbound_orders WHERE id = p_order_id;
    
    IF v_order IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Không tìm thấy đơn hàng');
    END IF;

    IF NOT v_order.is_approved THEN
         RETURN jsonb_build_object('success', false, 'error', 'Đơn hàng chưa được duyệt');
    END IF;

    -- Check if picking jobs exist (cannot unapprove if jobs started)
    PERFORM 1 FROM picking_jobs WHERE outbound_order_id = p_order_id;
    IF FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Không thể hủy duyệt: Đã có lệnh nhặt hàng (Picking Job). Vui lòng xóa job trước.');
    END IF;

    -- NEW LOGIC: Unlock Linked Boxes AND Clear outbound_order_id
    UPDATE boxes
    SET status = 'OPEN',
        outbound_order_id = NULL,
        updated_at = NOW()
    WHERE id IN (
        SELECT DISTINCT from_box_id 
        FROM outbound_order_items 
        WHERE order_id = p_order_id 
          AND from_box_id IS NOT NULL
    );

    -- Unapprove
    UPDATE outbound_orders 
    SET is_approved = FALSE, 
        approved_at = NULL, 
        approved_by = NULL 
    WHERE id = p_order_id;

    RETURN jsonb_build_object('success', true);
END;
$$;
