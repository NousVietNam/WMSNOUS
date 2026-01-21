-- =====================================================
-- Cleanup: Delete ALL Legacy Orders & Transfer Orders
-- =====================================================

-- Step 1: Unlink boxes from legacy orders
UPDATE boxes SET order_id = NULL WHERE order_id IS NOT NULL;

-- Step 2: Delete from order_items
DELETE FROM order_items;

-- Step 3: Delete from orders
DELETE FROM orders;

-- Step 4: Delete from transfer_order_items (if exists)
-- DELETE FROM transfer_order_items;

-- Step 5: Delete from transfer_orders
DELETE FROM transfer_orders;
