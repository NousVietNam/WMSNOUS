
-- Drop old function to be safe or just Replace
DROP FUNCTION IF EXISTS process_bulk_putaway(text, jsonb, uuid, text);
CREATE OR REPLACE FUNCTION process_bulk_putaway(
    p_box_code text,
    p_items jsonb,
    p_user_id uuid,
    p_reference text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_box_id uuid;
    v_location_id uuid;
    v_warehouse_id uuid;
    v_item jsonb;
    v_product_id uuid;
    v_sku text;
    v_qty int;
BEGIN
    -- 1. Get Box Info
    SELECT id, location_id, warehouse_id INTO v_box_id, v_location_id, v_warehouse_id
    FROM boxes
    WHERE code = p_box_code;

    IF v_box_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Box not found');
    END IF;

    -- 2. Loop Items
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_product_id := (v_item->>'product_id')::uuid;
        -- Fallback if product_id is missing but sku is there
        v_sku := v_item->>'sku';
        v_qty := (v_item->>'qty')::int;

        IF v_product_id IS NULL THEN
             SELECT id INTO v_product_id FROM products WHERE sku = v_sku;
        END IF;
        
        IF v_product_id IS NULL THEN
             -- Can't insert without product id? Or should we error?
             -- Continuing for robustness, listing as SKU in future fix if needed
             -- But transactions table expects SKU? Yes it has sku col.
             -- But bulk inventory needs product_id.
             -- Let's error if SKU not found to prevent data corruption
             RETURN jsonb_build_object('success', false, 'error', 'Product not found: ' || v_sku);
        END IF;

        -- 3. Update Bulk Inventory (Upsert)
        INSERT INTO bulk_inventory (box_id, product_id, quantity, created_at, updated_at)
        VALUES (v_box_id, v_product_id, v_qty, NOW(), NOW())
        ON CONFLICT (box_id, product_id)
        DO UPDATE SET
            quantity = bulk_inventory.quantity + EXCLUDED.quantity,
            updated_at = NOW();

        -- 4. Insert Transaction
        -- FIXED: Used reference_code instead of reference
        INSERT INTO transactions (
            type,
            entity_type,
            user_id,
            sku,
            quantity,
            to_box_id,
            to_location_id,
            warehouse_id,
            created_at,
            reference_code,
            note
        ) VALUES (
            'IMPORT',
            'BULK',
            p_user_id,
            v_sku,
            v_qty,
            v_box_id,
            v_location_id,
            v_warehouse_id,
            NOW(),
            p_reference,
            'Bulk Putway: ' || p_reference
        );

    END LOOP;

    RETURN jsonb_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;
