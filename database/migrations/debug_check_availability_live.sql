-- Debug script to check Bulk Inventory Availability
-- Usage: Replace 'SKU_CAN_KIEM_TRA' with the actual SKU (e.g., 'NB2S25-TB2-M04-OW-9M')

WITH target_product AS (
    SELECT id, sku, name FROM products WHERE sku = 'A26NB1-OP2-U01-SW-NB' LIMIT 1
),
inventory_data AS (
    SELECT 
        p.id,
        p.sku,
        COALESCE(SUM(bi.quantity), 0) as physical_total,
        COALESCE(SUM(bi.allocated_quantity), 0) as hard_allocated
    FROM target_product p
    LEFT JOIN bulk_inventory bi ON p.id = bi.product_id
    GROUP BY p.id, p.sku
),
soft_allocations AS (
    SELECT 
        o.id as order_id,
        o.code as order_code,
        o.status,
        o.created_at,
        ooi.quantity as reserved_qty
    FROM outbound_order_items ooi
    JOIN outbound_orders o ON ooi.order_id = o.id
    JOIN target_product p ON ooi.product_id = p.id
    WHERE o.inventory_type = 'BULK'
      AND o.is_approved = TRUE
      AND o.status NOT IN ('ALLOCATED', 'PICKING', 'PACKED', 'SHIPPED', 'COMPLETED', 'CANCELLED')
)
SELECT 
    i.sku,
    i.physical_total as "Tổng Tồn (Kho)",
    i.hard_allocated as "Đã Phân Bổ (Cứng)",
    (SELECT COALESCE(SUM(reserved_qty), 0) FROM soft_allocations) as "Đang Giữ Chỗ (Đơn Duyệt)",
    (i.physical_total - i.hard_allocated - (SELECT COALESCE(SUM(reserved_qty), 0) FROM soft_allocations)) as "Khả Dụng Tính Toán",
    (SELECT jsonb_agg(jsonb_build_object('code', order_code, 'qty', reserved_qty, 'status', status)) FROM soft_allocations) as "Đơn Đang Giữ Hàng"
FROM inventory_data i;
