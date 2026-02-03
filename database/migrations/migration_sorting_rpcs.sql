
-- 1. Function to Assign Sorter
CREATE OR REPLACE FUNCTION assign_wave_sorter(p_wave_id UUID, p_sorter_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE pick_waves 
    SET sorter_id = p_sorter_id, 
        sorting_status = CASE WHEN sorting_status = 'PENDING' THEN 'PROCESSING' ELSE sorting_status END,
        sorting_started_at = COALESCE(sorting_started_at, NOW())
    WHERE id = p_wave_id;

    RETURN jsonb_build_object('success', true);
END;
$$;

-- 2. Function to Get Sorting Data (Aggregate)
CREATE OR REPLACE FUNCTION get_wave_sorting_details(p_wave_id UUID)
RETURNS TABLE (
    order_id UUID,
    order_code TEXT,
    customer_name TEXT,
    total_qty BIGINT,
    picked_qty BIGINT,
    sorted_qty BIGINT,
    outbox_code TEXT,
    outbox_id UUID,
    status TEXT
)
LANGUAGE sql
SECURITY DEFINER
AS $$
    WITH OrderStats AS (
        SELECT 
            oo.id AS order_id,
            oo.code AS order_code,
            c.name AS customer_name,
            -- Quantities (Cols 4, 5, 6)
            (SELECT COALESCE(SUM(quantity), 0)::BIGINT FROM outbound_order_items WHERE order_id = oo.id) as total_qty,
            (SELECT COALESCE(SUM(quantity), 0)::BIGINT FROM picking_tasks pt 
             WHERE pt.job_id IN (SELECT id FROM picking_jobs WHERE wave_id = p_wave_id) 
               AND pt.status = 'COMPLETED'
               AND pt.order_item_id IN (SELECT id FROM outbound_order_items WHERE order_id = oo.id)
            ) as picked_qty,
            (SELECT count(*)::BIGINT FROM sorting_logs WHERE wave_id = p_wave_id AND outbound_order_id = oo.id AND action_type = 'SORT_ITEM') as sorted_qty,
            -- Outbox Info (Cols 7, 8)
            (SELECT code FROM boxes WHERE outbound_order_id = oo.id AND type = 'OUTBOX' LIMIT 1) as outbox_code,
            (SELECT id FROM boxes WHERE outbound_order_id = oo.id AND type = 'OUTBOX' LIMIT 1) as outbox_id,
            -- Status (Col 9)
            oo.status
        FROM outbound_orders oo
        LEFT JOIN customers c ON oo.customer_id = c.id
        WHERE oo.wave_id = p_wave_id
    )
    SELECT * FROM OrderStats;
$$;

-- 3. The Core: SORT ITEM LOGIC
CREATE OR REPLACE FUNCTION sort_item_scan(
    p_wave_id UUID, 
    p_barcode TEXT, 
    p_sorter_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_product_id UUID;
    v_product_name TEXT;
    v_product_sku TEXT;
    v_image_url TEXT;
    v_target_order_id UUID;
    v_target_outbox_code TEXT;
    v_target_outbox_id UUID;
    v_order_code TEXT;
    v_customer_name TEXT;
    v_required INT;
    v_sorted INT;
BEGIN
    -- 1. Identify Product
    SELECT id, name, sku, image_url INTO v_product_id, v_product_name, v_product_sku, v_image_url
    FROM products 
    WHERE barcode = p_barcode OR sku = p_barcode 
    LIMIT 1;

    IF v_product_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Không tìm thấy sản phẩm với mã này!');
    END IF;

    -- 2. Find Best Matching Order
    -- Priority: Orders that HAVE an outbox assigned AND need this item
    SELECT 
        oo.id, oo.code, c.name, b.code, b.id
    INTO 
        v_target_order_id, v_order_code, v_customer_name, v_target_outbox_code, v_target_outbox_id
    FROM outbound_orders oo
    JOIN outbound_order_items ooi ON oo.id = ooi.order_id
    LEFT JOIN boxes b ON b.outbound_order_id = oo.id AND b.type = 'OUTBOX'
    LEFT JOIN customers c ON oo.customer_id = c.id
    WHERE oo.wave_id = p_wave_id
      AND ooi.product_id = v_product_id
      -- Logic: Required > Sorted
      AND ooi.quantity > (
          SELECT COUNT(*) 
          FROM sorting_logs 
          WHERE wave_id = p_wave_id 
            AND outbound_order_id = oo.id 
            AND product_id = v_product_id
            AND action_type = 'SORT_ITEM'
      )
    ORDER BY 
        (b.id IS NOT NULL) DESC, -- Prioritize orders with Outbox ready
        oo.created_at ASC        -- FIFO
    LIMIT 1;

    IF v_target_order_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Sản phẩm này không cần thiết (hoặc đã đủ) cho Wave này!');
    END IF;

    -- 3. If Order found but NO Outbox
    IF v_target_outbox_id IS NULL THEN
         RETURN jsonb_build_object(
            'success', true, 
            'status', 'NEED_BOX',
            'product', jsonb_build_object('name', v_product_name, 'sku', v_product_sku, 'image', v_image_url),
            'order', jsonb_build_object('id', v_target_order_id, 'code', v_order_code, 'customer', v_customer_name),
            'message', 'Đơn hàng ' || v_order_code || ' chưa có thùng! Vui lòng gán thùng trước.'
        );
    END IF;

    -- 4. Record the Sort Action
    INSERT INTO sorting_logs (wave_id, outbound_order_id, product_id, outbox_id, sorter_id, action_type)
    VALUES (p_wave_id, v_target_order_id, v_product_id, v_target_outbox_id, p_sorter_id, 'SORT_ITEM');

    -- 5. Calculate Progress for this item in this order
    SELECT quantity INTO v_required FROM outbound_order_items WHERE order_id = v_target_order_id AND product_id = v_product_id;
    SELECT count(*) INTO v_sorted FROM sorting_logs WHERE wave_id = p_wave_id AND outbound_order_id = v_target_order_id AND product_id = v_product_id AND action_type = 'SORT_ITEM';

    RETURN jsonb_build_object(
        'success', true,
        'status', 'SORTED',
        'product', jsonb_build_object('name', v_product_name, 'sku', v_product_sku, 'image', v_image_url),
        'target', jsonb_build_object(
            'box_code', v_target_outbox_code,
            'order_code', v_order_code,
            'customer_name', v_customer_name
        ),
        'progress', jsonb_build_object('current', v_sorted, 'total', v_required)
    );
END;
$$;
