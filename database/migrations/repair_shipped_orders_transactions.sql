-- ========================================================
-- Migration: Repair Missing Transactions for SHIPPED Orders
-- Description: Scans all orders already marked as 'SHIPPED'.
--              If items are still in warehouse boxes linked to these orders,
--              it performs the deduction and logs the missing transactions.
-- ========================================================

DO $$
DECLARE
    v_order RECORD;
    v_item RECORD;
    v_shipment_id UUID;
    v_pxk_code TEXT;
    v_dest_name TEXT;
    v_repair_count INT := 0;
    v_trans_count INT := 0;
BEGIN
    RAISE NOTICE 'Bắt đầu quét các đơn hàng SHIPPED để bù dữ liệu...';

    FOR v_order IN 
        SELECT o.id, o.code, o.type, o.created_by, o.total, o.customer_id, o.destination_id,
               COALESCE(c.name, d.name) as partner_name
        FROM outbound_orders o
        LEFT JOIN customers c ON o.customer_id = c.id
        LEFT JOIN destinations d ON o.destination_id = d.id
        WHERE o.status = 'SHIPPED' 
    LOOP
        -- 1. Tìm hoặc tạo bản ghi Shipment (PXK)
        -- Logic tối ưu: Tìm tất cả phiếu liên quan (theo source cũ hoặc link mới), lấy cái cũ nhất (Original)
        SELECT id, code INTO v_shipment_id, v_pxk_code 
        FROM outbound_shipments 
        WHERE source_id = v_order.id OR outbound_order_id = v_order.id
        ORDER BY created_at ASC 
        LIMIT 1;

        IF v_shipment_id IS NOT NULL THEN
            -- Đảm bảo link đúng
            UPDATE outbound_shipments SET outbound_order_id = v_order.id WHERE id = v_shipment_id AND outbound_order_id IS NULL;
        ELSE
            -- Chỉ tạo mới nếu hoàn toàn không tìm thấy cái nào
            v_pxk_code := 'PXK-FIX-' || to_char(NOW(), 'YYMMDD') || '-' || substring(v_order.id::text from 1 for 4);
            
            INSERT INTO outbound_shipments (code, source_type, source_id, outbound_order_id, customer_name, metadata)
            VALUES (
                v_pxk_code, 
                v_order.type, 
                v_order.id, 
                v_order.id, 
                COALESCE(v_order.partner_name, 'N/A'), 
                jsonb_build_object('repair_mode', true, 'original_code', v_order.code, 'total', v_order.total)
            )
            RETURNING id INTO v_shipment_id;
            
            RAISE NOTICE 'Đã tạo bổ sung phiếu xuất % cho đơn %', v_pxk_code, v_order.code;
        END IF;

        -- Cập nhật thời gian shipped_at BẮT BUỘC (Force Update) theo ngày tạo phiếu xuất
        UPDATE outbound_orders 
        SET shipped_at = (SELECT created_at FROM outbound_shipments WHERE id = v_shipment_id), updated_at = NOW()
        WHERE id = v_order.id;

        -- 2. Quét các mặt hàng còn tồn trong các thùng liên kết với đơn này
        FOR v_item IN 
            SELECT i.id as inv_item_id, i.box_id, i.product_id, i.quantity, p.sku
            FROM boxes b
            JOIN inventory_items i ON i.box_id = b.id
            JOIN products p ON i.product_id = p.id
            WHERE b.outbound_order_id = v_order.id
        LOOP
            -- Kiểm tra xem giao dịch này đã được ghi log chưa (tránh trùng lặp)
            -- Dựa trên reference_id (shipment) và SKU và Box
            IF NOT EXISTS (
                SELECT 1 FROM transactions 
                WHERE reference_id = v_shipment_id 
                  AND sku = v_item.sku 
                  AND from_box_id = v_item.box_id
                  AND type IN ('SHIP', 'TRANSFER_OUT')
            ) THEN
                -- A. Ghi log giao dịch xuất kho
                INSERT INTO transactions (type, entity_type, sku, quantity, reference_id, from_box_id, user_id, note, created_at)
                VALUES (
                    CASE WHEN v_order.type = 'SALE' THEN 'SHIP' ELSE 'TRANSFER_OUT' END,
                    'ITEM', 
                    v_item.sku, 
                    -v_item.quantity, 
                    v_shipment_id, 
                    v_item.box_id, 
                    COALESCE(v_order.created_by, (SELECT id FROM users LIMIT 1)), -- Dự phòng user
                    'Bù giao dịch xuất kho (Đơn: ' || v_order.code || ')',
                    NOW()
                );

                -- B. Trừ tồn kho và Phân bổ (Dựa trên số lượng trong thùng đã liên kết)
                UPDATE inventory_items 
                SET quantity = GREATEST(0, quantity - v_item.quantity),
                    allocated_quantity = GREATEST(0, COALESCE(allocated_quantity, 0) - v_item.quantity)
                WHERE id = v_item.inv_item_id;

                -- C. Dọn dẹp bản ghi rỗng
                DELETE FROM inventory_items WHERE id = v_item.inv_item_id AND quantity <= 0 AND allocated_quantity <= 0;
                
                v_trans_count := v_trans_count + 1;
            END IF;
        END LOOP;

        -- 3. Cập nhật trạng thái Thùng và Thời gian xuất nếu chưa chuẩn
        UPDATE boxes 
        SET status = 'SHIPPED', updated_at = NOW() 
        WHERE outbound_order_id = v_order.id AND status != 'SHIPPED';

        UPDATE outbound_orders 
        SET shipped_at = NOW(), updated_at = NOW() 
        WHERE id = v_order.id AND shipped_at IS NULL;
        
        v_repair_count := v_repair_count + 1;
    END LOOP;

    RAISE NOTICE 'Hoàn thành sửa lỗi:';
    RAISE NOTICE '- Số đơn hàng đã rà soát: %', v_repair_count;
    RAISE NOTICE '- Số giao dịch bù đã tạo và số mục tồn kho đã trừ: %', v_trans_count;
END $$;
