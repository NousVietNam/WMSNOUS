
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
    SELECT id, location_id INTO v_box_id, v_location_id
    FROM boxes 
    WHERE code = p_box_code;

    IF v_box_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Box not found');
    END IF;
    
    -- 2. Get Warehouse ID (Fallback strategy)
    -- Try to find a warehouse, defaulting to the first one found if no direct link
    SELECT id INTO v_warehouse_id FROM warehouses LIMIT 1;
    
    IF v_warehouse_id IS NULL THEN
        -- If no warehouse table or empty, leave it null or handle error?
        -- Transactions usually allow null warehouse_id or we can just proceed.
        -- But let's try to be safe.
        NULL; 
    END IF;

    -- 3. Loop Items
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
             RETURN jsonb_build_object('success', false, 'error', 'Product not found: ' || v_sku);
        END IF;

        -- 4. Update Bulk Inventory (Upsert)
        INSERT INTO bulk_inventory (box_id, product_id, quantity, created_at, updated_at)
        VALUES (v_box_id, v_product_id, v_qty, NOW(), NOW())
        ON CONFLICT (box_id, product_id)
        DO UPDATE SET
            quantity = bulk_inventory.quantity + EXCLUDED.quantity,
            updated_at = NOW();

        -- 5. Insert Transaction
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
