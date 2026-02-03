
CREATE OR REPLACE FUNCTION sort_item_scan_v2(
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
    v_source_cart_id UUID;
    v_source_cart_code TEXT;
    v_inventory_record_id UUID;
BEGIN
    -- 1. Identify Product
    SELECT id, name, sku, image_url INTO v_product_id, v_product_name, v_product_sku, v_image_url
    FROM products 
    WHERE barcode = p_barcode OR sku = p_barcode 
    LIMIT 1;

    IF v_product_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Không tìm thấy sản phẩm!');
    END IF;

    -- 2. Find Source Inventory in Carts associated with this Wave
    -- Logic: Find a CART that has this product, linked to this Wave (via picking jobs)
    -- Or simpler: Look for any Box of type 'CART' that contains this product and is 'assigned' to this process?
    -- Actually, Picking Tasks stored the 'box_id' (Cart).
    SELECT 
        b.id, b.code, bi.id
    INTO 
        v_source_cart_id, v_source_cart_code, v_inventory_record_id
    FROM bulk_inventory_items bi
    JOIN boxes b ON bi.box_id = b.id
    WHERE bi.product_id = v_product_id
      AND bi.quantity > 0
      AND b.type = 'CART'
      -- Strict: The cart must be used in a job of this wave
      AND b.id IN (
          SELECT DISTINCT box_id 
          FROM picking_tasks 
          WHERE job_id IN (SELECT id FROM picking_jobs WHERE wave_id = p_wave_id)
            AND status = 'COMPLETED'
      )
    LIMIT 1;

    IF v_source_cart_id IS NULL THEN
        -- Fallback: Maybe it's a LOOSE item or logic miss. 
        -- Allow finding ANY cart if strict check fails? No, strict is safer.
        RETURN jsonb_build_object('success', false, 'error', 'Sản phẩm này không thấy trong các Xe Đẩy của Wave này! (Hoặc đã hết)');
    END IF;

    -- 3. Find Best Matching Order (Target)
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
      -- Logic: Needs more than sorted
      AND ooi.quantity > (
          SELECT COUNT(*) 
          FROM sorting_logs 
          WHERE wave_id = p_wave_id 
            AND outbound_order_id = oo.id 
            AND product_id = v_product_id
            AND action_type = 'SORT_ITEM'
      )
    ORDER BY 
        (b.id IS NOT NULL) DESC, -- Prioritize orders with Outbox
        oo.created_at ASC        -- FIFO
    LIMIT 1;

    IF v_target_order_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Sản phẩm này dư thừa (đã chia đủ cho các đơn)!');
    END IF;

    IF v_target_outbox_id IS NULL THEN
         RETURN jsonb_build_object('success', true, 'status', 'NEED_BOX', 'order', jsonb_build_object('code', v_order_code, 'customer', v_customer_name));
    END IF;

    -- 4. EXECUTE MOVEMENT (Cart -> Outbox)
    -- Update Source (Cart)
    UPDATE bulk_inventory_items 
    SET quantity = quantity - 1 
    WHERE id = v_inventory_record_id;

    -- Update/Insert Target (Outbox)
    -- Check if record exists in target box
    IF EXISTS (SELECT 1 FROM bulk_inventory_items WHERE box_id = v_target_outbox_id AND product_id = v_product_id) THEN
        UPDATE bulk_inventory_items 
        SET quantity = quantity + 1 
        WHERE box_id = v_target_outbox_id AND product_id = v_product_id;
    ELSE
        INSERT INTO bulk_inventory_items (box_id, product_id, quantity, created_at)
        VALUES (v_target_outbox_id, v_product_id, 1, NOW());
    END IF;

    -- 5. Record Log
    INSERT INTO sorting_logs (wave_id, outbound_order_id, product_id, outbox_id, sorter_id, action_type)
    VALUES (p_wave_id, v_target_order_id, v_product_id, v_target_outbox_id, p_sorter_id, 'SORT_ITEM');

    -- 6. Clean up zero qty source (Optional, but good for hygiene)
    DELETE FROM bulk_inventory_items WHERE id = v_inventory_record_id AND quantity <= 0;

    -- 7. Return Info
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
        'progress', jsonb_build_object('current', v_sorted, 'total', v_required),
        'message', 'Đã chuyển 1 cái từ ' || v_source_cart_code
    );
END;
$$;

-- Rename to overwrite/update the original or use v2 directly
-- Let's DROP existing and CREATE this as the main function to avoid confusion
DROP FUNCTION IF EXISTS sort_item_scan;
ALTER FUNCTION sort_item_scan_v2 RENAME TO sort_item_scan;
