
-- Fix approve_outbound to support Strict Inventory Separation and SOFT ALLOCATION
-- 1. Retail Orders (PIECE) -> Check 'inventory_items' (Retail) - Soft Booked (Retail)
-- 2. Bulk Orders (BULK) -> Check 'bulk_inventory' (Wholesale) - Soft Booked (Bulk)

CREATE OR REPLACE FUNCTION approve_outbound(p_order_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_order RECORD;
    v_item RECORD;
    v_missing JSONB := '[]'::JSONB;
    v_current_stock INT;
    v_hard_allocated INT;
    v_soft_booked INT;
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
        -- A. BULK LOGIC
        IF v_order.inventory_type = 'BULK' THEN
            -- 1. Get Physical Stock + Hard Allocated
            -- Hard Allocated = Stock reserved by RELEASED WAVES
            SELECT 
                COALESCE(SUM(quantity), 0),
                COALESCE(SUM(allocated_quantity), 0)
            INTO v_current_stock, v_hard_allocated
            FROM bulk_inventory
            WHERE product_id = v_item.product_id;
            
            -- 2. Get Soft Booked (Approved Bulk Orders, Not yet allocated)
            -- Soft Booked = Orders APPROVED but NOT YET IN WAVEs (or in Planning Waves)
            SELECT COALESCE(SUM(ooi.quantity), 0)
            INTO v_soft_booked
            FROM outbound_order_items ooi
            JOIN outbound_orders o ON ooi.order_id = o.id
            WHERE ooi.product_id = v_item.product_id
              AND o.inventory_type = 'BULK'
              AND o.is_approved = TRUE
              AND o.status IN ('PENDING') -- Still pending wave allocation
              AND o.id != p_order_id; -- Exclude current

        -- B. RETAIL LOGIC (PIECE)
        ELSE 
            -- 1. Get Physical Stock + Hard Allocated (Retail Boxes)
            SELECT 
                COALESCE(SUM(quantity), 0),
                COALESCE(SUM(allocated_quantity), 0)
            INTO v_current_stock, v_hard_allocated
            FROM inventory_items
            WHERE product_id = v_item.product_id;
            
            -- 2. Get Soft Booked (Approved Retail Orders)
            SELECT COALESCE(SUM(ooi.quantity), 0)
            INTO v_soft_booked
            FROM outbound_order_items ooi
            JOIN outbound_orders o ON ooi.order_id = o.id
            WHERE ooi.product_id = v_item.product_id
              AND (o.inventory_type = 'PIECE' OR o.inventory_type IS NULL)
              AND o.is_approved = TRUE
              AND o.status IN ('PENDING')
              AND o.id != p_order_id;
        END IF;

        -- CALC AVAILABLE: Physical - Hard (Wave) - Soft (Approved Orders)
        v_available := GREATEST(0, v_current_stock - v_hard_allocated - v_soft_booked);

        -- CHECK
        IF v_available < v_item.quantity THEN
             v_missing := v_missing || jsonb_build_object(
                'product_id', v_item.product_id,
                'sku', v_item.sku,
                'requested', v_item.quantity,
                'available_phys', v_current_stock,
                'hard_alloc', v_hard_allocated,
                'soft_booked', v_soft_booked,
                'available_final', v_available,
                'type', v_order.inventory_type
             );
        END IF;
    END LOOP;

    -- If missing items, return error details
    IF jsonb_array_length(v_missing) > 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Không đủ tồn kho khả dụng (Đang bị giữ bởi đơn đã duyệt khác)', 'missing', v_missing);
    END IF;

    -- Approve -> This effectively increases "Soft Booked" for future checks
    UPDATE outbound_orders 
    SET is_approved = TRUE, 
        approved_at = NOW(), 
        approved_by = auth.uid() 
    WHERE id = p_order_id;

    RETURN jsonb_build_object('success', true);
END;
$$;
