-- =====================================================
-- Debug: Find inventory items with negative allocated_quantity
-- =====================================================

-- Query 1: Find all inventory_items with allocated_quantity < 0
SELECT 
    i.id,
    i.quantity,
    i.allocated_quantity,
    p.sku,
    p.name,
    b.code as box_code
FROM inventory_items i
JOIN products p ON i.product_id = p.id
LEFT JOIN boxes b ON i.box_id = b.id
WHERE i.allocated_quantity < 0
ORDER BY i.allocated_quantity ASC;

-- Query 2: Sum of all allocated_quantity (should not be negative in total)
SELECT 
    SUM(allocated_quantity) as total_allocated,
    COUNT(*) as items_with_allocated
FROM inventory_items
WHERE allocated_quantity != 0;

-- Query 3: Fix negative allocated_quantity by setting to 0
-- UNCOMMENT TO RUN:
-- UPDATE inventory_items SET allocated_quantity = 0 WHERE allocated_quantity < 0;
