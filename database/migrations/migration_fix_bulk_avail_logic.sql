-- 1. FIX view_product_availability_bulk to include Soft Allocation
CREATE OR REPLACE VIEW view_product_availability_bulk AS
WITH soft_allocation AS (
    -- Bulk Soft Allocation: Only count orders marked as 'BULK'
    SELECT 
        ooi.product_id, 
        SUM(ooi.quantity) as qty,
        o.type
    FROM outbound_order_items ooi
    JOIN outbound_orders o ON ooi.order_id = o.id
    WHERE o.is_approved = TRUE 
      AND o.status NOT IN ('ALLOCATED', 'PICKING', 'PACKED', 'SHIPPED', 'COMPLETED', 'CANCELLED')
      AND o.inventory_type = 'BULK'
    GROUP BY ooi.product_id, o.type
),
aggregated_soft AS (
    SELECT 
        product_id, 
        SUM(CASE WHEN type = 'SALE' THEN qty ELSE 0 END) as soft_sale,
        SUM(CASE WHEN type = 'GIFT' THEN qty ELSE 0 END) as soft_gift,
        SUM(CASE WHEN type = 'INTERNAL' THEN qty ELSE 0 END) as soft_internal,
        SUM(CASE WHEN type = 'TRANSFER' THEN qty ELSE 0 END) as soft_transfer
    FROM soft_allocation
    GROUP BY product_id
)
SELECT 
    p.id as product_id,
    p.sku,
    p.name,
    COALESCE(SUM(bi.quantity), 0) as total_quantity,
    COALESCE(SUM(bi.allocated_quantity), 0) as hard_allocated,
    
    COALESCE(s.soft_sale, 0) as soft_booked_sale,
    COALESCE(s.soft_gift, 0) as soft_booked_gift,
    COALESCE(s.soft_internal, 0) as soft_booked_internal,
    COALESCE(s.soft_transfer, 0) as soft_booked_transfer,
    
    -- Real Available = Total - Hard - Soft
    GREATEST(0, 
        COALESCE(SUM(bi.quantity), 0) 
        - COALESCE(SUM(bi.allocated_quantity), 0) 
        - COALESCE(s.soft_sale, 0) 
        - COALESCE(s.soft_gift, 0) 
        - COALESCE(s.soft_internal, 0) 
        - COALESCE(s.soft_transfer, 0)
    ) as available_quantity
FROM products p
LEFT JOIN bulk_inventory bi ON p.id = bi.product_id
LEFT JOIN aggregated_soft s ON p.id = s.product_id
GROUP BY p.id, p.sku, p.name, s.soft_sale, s.soft_gift, s.soft_internal, s.soft_transfer;

GRANT SELECT ON view_product_availability_bulk TO authenticated;
GRANT SELECT ON view_product_availability_bulk TO anon;


-- 2. UPDATE approve_outbound to query correct view based on inventory_type
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
    v_inv_type TEXT;
BEGIN
    SELECT * INTO v_order FROM outbound_orders WHERE id = p_order_id;
    
    IF v_order IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Không tìm thấy đơn hàng');
    END IF;

    IF v_order.is_approved THEN
         RETURN jsonb_build_object('success', false, 'error', 'Đơn hàng đã được duyệt rồi');
    END IF;

    v_inv_type := COALESCE(v_order.inventory_type, 'PIECE');

    -- Check availability for grouped items
    FOR v_item IN 
        SELECT 
            ooi.product_id, 
            SUM(ooi.quantity) as quantity,
            p.sku,
            p.name as product_name
        FROM outbound_order_items ooi
        JOIN products p ON ooi.product_id = p.id
        WHERE ooi.order_id = p_order_id 
        GROUP BY ooi.product_id, p.sku, p.name
    LOOP
        -- Get current availability based on Inventory Type
        IF v_inv_type = 'BULK' THEN
            SELECT available_quantity INTO v_available
            FROM view_product_availability_bulk 
            WHERE product_id = v_item.product_id;
        ELSE
            SELECT available_quantity INTO v_available
            FROM view_product_availability 
            WHERE product_id = v_item.product_id;
        END IF;

        -- If total requested > available, add to missing list
        IF COALESCE(v_available, 0) < v_item.quantity THEN
             v_missing := v_missing || jsonb_build_object(
                'product_id', v_item.product_id,
                'sku', v_item.sku,
                'product_name', v_item.product_name,
                'requested', v_item.quantity,
                'available', COALESCE(v_available, 0),
                'missing', v_item.quantity - COALESCE(v_available, 0)
             );
        END IF;
    END LOOP;

    -- If missing items, return error details
    IF jsonb_array_length(v_missing) > 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Không đủ tồn kho khả dụng (' || v_inv_type || ')', 'missing', v_missing);
    END IF;

    -- Lock Linked Boxes AND Set outbound_order_id
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

GRANT EXECUTE ON FUNCTION approve_outbound(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION approve_outbound(UUID) TO anon;
