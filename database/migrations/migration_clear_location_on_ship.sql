-- Update the ship_outbound_order RPC to clear location_id for shipped boxes
CREATE OR REPLACE FUNCTION ship_outbound_order(p_order_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_order RECORD;
    v_box_ids UUID[];
    v_pxk_code TEXT;
    v_shipment_id UUID;
    v_item_count INT;
    v_box_count INT;
    v_job_id UUID;
    v_user_id UUID;
BEGIN
    v_user_id := auth.uid();

    -- 1. Get Outbound Order
    SELECT * INTO v_order FROM outbound_orders WHERE id = p_order_id FOR UPDATE;
    IF v_order IS NULL THEN 
        RETURN jsonb_build_object('success', false, 'error', 'Không tìm thấy đơn hàng/phiếu xuất'); 
    END IF;
    
    IF v_order.status = 'SHIPPED' THEN 
        RETURN jsonb_build_object('success', false, 'error', 'Đơn hàng này đã được xuất kho trước đó'); 
    END IF;

    -- 2. Basic Validation
    IF v_order.status != 'PACKED' AND v_order.status != 'COMPLETED' THEN 
        RETURN jsonb_build_object('success', false, 'error', 'Đơn hàng chưa ở trạng thái sẵn sàng xuất (PACKED). Hiện tại: ' || v_order.status); 
    END IF;

    -- 3. Calculate Item Count
    SELECT COALESCE(SUM(quantity), 0) INTO v_item_count FROM outbound_order_items WHERE outbound_order_id = p_order_id;
    
    -- 4. Calculate Box Count
    SELECT COUNT(*) INTO v_box_count FROM boxes WHERE outbound_order_id = p_order_id;

    -- 5. Find latest picking job
    SELECT id INTO v_job_id FROM picking_jobs WHERE outbound_order_id = p_order_id ORDER BY created_at DESC LIMIT 1;

    -- 6. Generate PXK Code
    v_pxk_code := generate_pxk_code();

    -- 7. Create Outbound Shipment Record
    INSERT INTO outbound_shipments (
        code, 
        source_type, 
        source_id, 
        created_by, 
        outbound_order_id,
        picking_job_id,
        customer_name,
        box_count,
        metadata
    )
    VALUES (
        v_pxk_code, 
        v_order.type, 
        p_order_id,
        v_user_id,
        p_order_id,
        v_job_id,
        COALESCE(v_order.customer_name, 'N/A'),
        v_box_count,
        jsonb_build_object(
            'item_count', v_item_count,
            'original_code', v_order.code,
            'order_type', v_order.type
        )
    )
    RETURNING id INTO v_shipment_id;

    -- 8. Update Outbound Order Status
    UPDATE outbound_orders SET status = 'SHIPPED', updated_at = NOW() WHERE id = p_order_id;

    -- 9. Decrease Inventory and Record Transactions
    -- Find all boxes linked to this outbound order
    SELECT array_agg(id) INTO v_box_ids FROM boxes WHERE outbound_order_id = p_order_id;

    IF v_box_ids IS NOT NULL THEN
        -- Record Transactions
        INSERT INTO transactions (type, entity_type, quantity, sku, reference_id, from_box_id, user_id, note, created_at)
        SELECT 
            CASE 
                WHEN v_order.type = 'TRANSFER' THEN 'TRANSFER_OUT'
                ELSE 'SHIP'
            END,
            'ITEM', 
            -i.quantity, 
            p.sku, 
            v_shipment_id, 
            i.box_id, 
            v_user_id, 
            'Xuất quy chiếu ' || v_order.code || ' (' || v_pxk_code || ')', 
            NOW()
        FROM inventory_items i 
        JOIN products p ON i.product_id = p.id 
        WHERE i.box_id = ANY(v_box_ids);
        
        -- Remove Inventory
        DELETE FROM inventory_items WHERE box_id = ANY(v_box_ids);
        
        -- Update Box Status AND CLEAR LOCATION
        UPDATE boxes 
        SET status = 'SHIPPED', 
            updated_at = NOW(),
            location_id = NULL
        WHERE id = ANY(v_box_ids);
    END IF;

    -- 10. Complete any related picking jobs if not already
    IF v_job_id IS NOT NULL THEN
        UPDATE picking_jobs SET status = 'COMPLETED', completed_at = NOW() WHERE id = v_job_id AND status != 'COMPLETED';
    END IF;

    RETURN jsonb_build_object(
        'success', true, 
        'message', 'Xuất kho thành công cho ' || v_order.type || ': ' || v_pxk_code,
        'shipment_code', v_pxk_code,
        'shipment_id', v_shipment_id
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;
