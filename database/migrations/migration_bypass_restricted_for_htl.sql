-- Migration: Bypass Restricted Check for HTL (Return Goods) Boxes
-- Function: process_bulk_putaway

CREATE OR REPLACE FUNCTION process_bulk_putaway(
    p_box_code TEXT,
    p_items JSONB,
    p_user_id UUID,
    p_reference TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
    v_box_id UUID;
    v_location_id UUID;
    v_box_inventory_type TEXT;
    v_item JSONB;
    v_product_id UUID;
    v_sku TEXT;
    v_qty INT;
    v_current_qty INT;
    v_restricted_count INT;
BEGIN
    -- 1. Validate Box
    SELECT id, location_id, inventory_type INTO v_box_id, v_location_id, v_box_inventory_type
    FROM boxes 
    WHERE code = p_box_code;

    IF v_box_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Thùng không tồn tại');
    END IF;

    IF v_box_inventory_type != 'BULK' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Thùng này không phải kho Sỉ');
    END IF;

    -- 2. Process Items
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_sku := v_item->>'sku';
        v_qty := (v_item->>'qty')::INT;
        v_product_id := (v_item->>'product_id')::UUID; -- Optional if passed

        IF v_product_id IS NULL THEN
            SELECT id INTO v_product_id FROM products WHERE sku = v_sku;
        END IF;

        IF v_product_id IS NULL THEN
             RAISE EXCEPTION 'Sản phẩm % không tồn tại', v_sku;
        END IF;

        -- 3. Restricted Check Logic
        -- Skip check if box code starts with BOX-00031 OR HTL-
        IF NOT (p_box_code LIKE 'BOX-00031%' OR p_box_code LIKE 'HTL-%') THEN
            SELECT COUNT(*) INTO v_restricted_count FROM restricted_inventory WHERE sku = v_sku;
            IF v_restricted_count = 0 THEN
               RAISE EXCEPTION 'Sản phẩm % không thuộc diện Kho Sỉ (Restricted).', v_sku;
            END IF;
        END IF;

        -- 4. Upsert into bulk_inventory
        SELECT quantity INTO v_current_qty 
        FROM bulk_inventory 
        WHERE box_id = v_box_id AND product_id = v_product_id;

        IF v_current_qty IS NOT NULL THEN
            UPDATE bulk_inventory 
            SET quantity = quantity + v_qty, updated_at = NOW()
            WHERE box_id = v_box_id AND product_id = v_product_id;
        ELSE
            INSERT INTO bulk_inventory (box_id, product_id, quantity, created_at, updated_at)
            VALUES (v_box_id, v_product_id, v_qty, NOW(), NOW());
        END IF;

        -- 5. Record Transaction
        INSERT INTO transactions (
            type, 
            entity_type, 
            sku, 
            quantity, 
            to_box_id, 
            to_location_id, 
            user_id, 
            reference, 
            product_id,
            created_at
        ) VALUES (
            'IMPORT', 
            'BULK', 
            v_sku, 
            v_qty, 
            v_box_id, 
            v_location_id, 
            p_user_id, 
            COALESCE(p_reference, 'Bulk Putaway'), 
            v_product_id,
            NOW()
        );

    END LOOP;

    -- 6. Update Box Item Count Cache (Optional but good for UI)
    -- Trigger usually handles this, but ensuring consistency is good.
    
    RETURN jsonb_build_object('success', true);

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql;
