-- =====================================================
-- Cleanup: Delete ALL Outbound Orders
-- =====================================================

-- Step 1: Delete all outbound_order_items
DELETE FROM outbound_order_items;

-- Step 2: Unlink all boxes from outbound_orders
UPDATE boxes SET outbound_order_id = NULL WHERE outbound_order_id IS NOT NULL;

-- Step 3: Delete all outbound_orders
DELETE FROM outbound_orders;
