-- =====================================================
-- Migration: Unified Outbound Data
-- Description: Move data from legacy tables (orders, transfer_orders)
--              to new unified table (outbound_orders)
-- =====================================================

DO $$
BEGIN
    -- 1. Migrate SALE Orders
    -- Map: orders -> outbound_orders (type='SALE')
    INSERT INTO outbound_orders (
        id, code, type, status, is_approved, approved_at, approved_by,
        customer_id, sale_staff_id, created_by,
        subtotal, discount_amount, total, note, created_at, updated_at
    )
    SELECT 
        id, code, 'SALE', 
        CASE 
            WHEN status = 'PENDING' THEN 'PENDING'
            WHEN status = 'APPROVED' THEN 'APPROVED'
            WHEN status = 'SHIPPING' THEN 'PICKING' -- Approximation
            WHEN status = 'SHIPPED' THEN 'SHIPPED'
            WHEN status = 'COMPLETED' THEN 'COMPLETED'
            WHEN status = 'CANCELLED' THEN 'CANCELLED'
            ELSE 'PENDING'
        END,
        (status != 'PENDING' AND status != 'CANCELLED'), -- is_approved approximation
        updated_at, -- approved_at approximation
        NULL, -- approved_by (unknown)
        NULL, NULL, NULL, -- customer, staff, created_by all NULL
        0, 0, 0, NULL, created_at, updated_at -- financial & note set to default/null
    FROM orders
    ON CONFLICT (id) DO NOTHING;

    -- 2. Migrate TRANSFER Orders
    -- Map: transfer_orders -> outbound_orders (type='TRANSFER')
    INSERT INTO outbound_orders (
        id, code, type, transfer_type, status,
        destination_id, created_by,
        note, created_at, updated_at
    )
    SELECT 
        id, code, 'TRANSFER', 
        'ITEM', -- Default transfer type
        status, 
        to_location_id, -- Mapping destination
        created_by,
        note, created_at, updated_at
    FROM transfer_orders
    ON CONFLICT (id) DO NOTHING;

    -- 3. Migrate Order Items
    -- Map: order_items -> outbound_order_items
    INSERT INTO outbound_order_items (
        id, order_id, product_id, quantity, unit_price, line_total, created_at
    )
    SELECT 
        id, order_id, product_id, quantity, unit_price, line_total, created_at
    FROM order_items
    ON CONFLICT (id) DO NOTHING;

    -- 4. Migrate Transfer Items
    -- Map: transfer_order_items -> outbound_order_items
    INSERT INTO outbound_order_items (
        id, order_id, product_id, quantity, created_at
    )
    SELECT 
        id, transfer_order_id, product_id, quantity, created_at
    FROM transfer_order_items
    ON CONFLICT (id) DO NOTHING;
    
    RAISE NOTICE 'Data migration completed successfully.';
END $$;
