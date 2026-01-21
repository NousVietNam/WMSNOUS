-- =====================================================
-- Migration: Update RPC and Sync Views (Split Types - ROBUST FIX)
-- This migration splits soft bookings into 4 categories: SALE, GIFT, INTERNAL, TRANSFER.
-- It also fixes the naming conflict error in PostgreSQL views.
-- =====================================================

-- 1. Drop unused view
DROP VIEW IF EXISTS view_product_stock CASCADE;

-- 2. Handle view_product_availability (FORCE RECREATION)
-- We use CASCADE to drop dependent functions (like approve_outbound) temporarily
-- to allow changing column names, which CREATE OR REPLACE VIEW does not support.
DROP VIEW IF EXISTS view_product_availability CASCADE;

CREATE VIEW view_product_availability AS
WITH soft_allocation AS (
    -- All Outbound Items (Demand)
    SELECT 
        ooi.product_id, 
        SUM(ooi.quantity) as qty,
        o.type
    FROM outbound_order_items ooi
    JOIN outbound_orders o ON ooi.order_id = o.id
    WHERE o.is_approved = TRUE 
      AND o.status NOT IN ('ALLOCATED', 'PICKING', 'PACKED', 'SHIPPED', 'COMPLETED', 'CANCELLED')
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
    COALESCE(SUM(i.quantity), 0) as total_quantity,
    COALESCE(SUM(i.allocated_quantity), 0) as hard_allocated,
    
    COALESCE(s.soft_sale, 0) as soft_booked_sale,
    COALESCE(s.soft_gift, 0) as soft_booked_gift,
    COALESCE(s.soft_internal, 0) as soft_booked_internal,
    COALESCE(s.soft_transfer, 0) as soft_booked_transfer,
    
    -- Real Available = Total - Hard - All Soft
    GREATEST(0, 
        COALESCE(SUM(i.quantity), 0) 
        - COALESCE(SUM(i.allocated_quantity), 0) 
        - COALESCE(s.soft_sale, 0) 
        - COALESCE(s.soft_gift, 0) 
        - COALESCE(s.soft_internal, 0) 
        - COALESCE(s.soft_transfer, 0)
    ) as available_quantity
FROM products p
LEFT JOIN inventory_items i ON p.id = i.product_id
LEFT JOIN aggregated_soft s ON p.id = s.product_id
GROUP BY p.id, p.sku, p.name, s.soft_sale, s.soft_gift, s.soft_internal, s.soft_transfer;

GRANT SELECT ON view_product_availability TO authenticated;
GRANT SELECT ON view_product_availability TO anon;

-- 3. Restore approve_outbound (was dropped by CASCADE above)
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

    -- Check availability for each item
    FOR v_item IN SELECT * FROM outbound_order_items WHERE order_id = p_order_id LOOP
        -- Get current availability
        SELECT available_quantity INTO v_available
        FROM view_product_availability 
        WHERE product_id = v_item.product_id;
        
        -- If requested > available, add to missing list
        IF COALESCE(v_available, 0) < v_item.quantity THEN
             v_missing := v_missing || jsonb_build_object(
                'product_id', v_item.product_id,
                'sku', (SELECT sku FROM products WHERE id = v_item.product_id),
                'requested', v_item.quantity,
                'available', COALESCE(v_available, 0)
             );
        END IF;
    END LOOP;

    -- If missing items, return error details
    IF jsonb_array_length(v_missing) > 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Không đủ tồn kho khả dụng', 'missing', v_missing);
    END IF;

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


-- 4. Recreate get_inventory_summary (handling overloading)
DO $$ 
DECLARE 
    r RECORD;
BEGIN
    FOR r IN (SELECT oid::regprocedure as proc_name 
              FROM pg_proc 
              WHERE proname = 'get_inventory_summary') 
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.proc_name;
    END LOOP;
END $$;

CREATE FUNCTION get_inventory_summary(
    p_location_code TEXT DEFAULT NULL,
    p_box_code TEXT DEFAULT NULL,
    p_brand TEXT DEFAULT NULL,
    p_target_audience TEXT DEFAULT NULL,
    p_product_group TEXT DEFAULT NULL,
    p_season TEXT DEFAULT NULL,
    p_launch_month TEXT DEFAULT NULL,
    p_search TEXT DEFAULT NULL,
    p_warehouse_id UUID DEFAULT NULL
)
RETURNS TABLE (
    total_quantity BIGINT,
    total_allocated BIGINT,
    total_approved_sale BIGINT,
    total_approved_gift BIGINT,
    total_approved_internal BIGINT,
    total_approved_transfer BIGINT,
    available_detail BIGINT,
    available_summary BIGINT
)
AS $$
DECLARE
    v_total_qty BIGINT;
    v_total_allocated BIGINT;
    v_total_sale BIGINT;
    v_total_gift BIGINT;
    v_total_internal BIGINT;
    v_total_transfer BIGINT;
BEGIN
    -- 1. Inventory Aggregates
    SELECT 
        COALESCE(SUM(i.quantity), 0),
        COALESCE(SUM(i.allocated_quantity), 0)
    INTO v_total_qty, v_total_allocated
    FROM inventory_items i
    JOIN products p ON i.product_id = p.id
    LEFT JOIN boxes b ON i.box_id = b.id
    LEFT JOIN locations l_box ON b.location_id = l_box.id
    LEFT JOIN locations l_direct ON i.location_id = l_direct.id
    WHERE 
        (p_warehouse_id IS NULL OR i.warehouse_id = p_warehouse_id) AND
        (p_brand IS NULL OR p.brand = p_brand) AND
        (p_target_audience IS NULL OR p.target_audience = p_target_audience) AND
        (p_product_group IS NULL OR p.product_group = p_product_group) AND
        (p_season IS NULL OR p.season = p_season) AND
        (p_launch_month IS NULL OR p.launch_month::text = p_launch_month) AND
        (p_location_code IS NULL OR COALESCE(l_box.code, l_direct.code) = p_location_code) AND
        (p_box_code IS NULL OR b.code = p_box_code) AND
        (p_search IS NULL OR (
            p.name ILIKE '%' || p_search || '%' OR
            p.sku ILIKE '%' || p_search || '%' OR
            (p.barcode IS NOT NULL AND p.barcode ILIKE '%' || p_search || '%')
        ));

    -- 2. Soft Allocation Split by Type
    SELECT 
        COALESCE(SUM(CASE WHEN type = 'SALE' THEN calc_qty ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN type = 'GIFT' THEN calc_qty ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN type = 'INTERNAL' THEN calc_qty ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN type = 'TRANSFER' THEN calc_qty ELSE 0 END), 0)
    INTO v_total_sale, v_total_gift, v_total_internal, v_total_transfer
    FROM (
        SELECT ooi.quantity as calc_qty, o.type
        FROM outbound_order_items ooi
        JOIN outbound_orders o ON ooi.order_id = o.id
        WHERE 
            o.is_approved = TRUE AND
            o.status NOT IN ('ALLOCATED', 'PICKING', 'PACKED', 'SHIPPED', 'COMPLETED', 'CANCELLED')
    ) combined;

    -- Final Calculations
    total_quantity := v_total_qty;
    total_allocated := v_total_allocated;
    total_approved_sale := v_total_sale;
    total_approved_gift := v_total_gift;
    total_approved_internal := v_total_internal;
    total_approved_transfer := v_total_transfer;

    available_detail := GREATEST(0, v_total_qty - v_total_allocated);
    available_summary := GREATEST(0, v_total_qty - v_total_allocated - v_total_sale - v_total_gift - v_total_internal - v_total_transfer);
    
    RETURN NEXT;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION get_inventory_summary(text,text,text,text,text,text,text,text,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_inventory_summary(text,text,text,text,text,text,text,text,uuid) TO anon;
