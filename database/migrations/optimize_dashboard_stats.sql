-- Create a function to get dashboard stats efficiently
CREATE OR REPLACE FUNCTION get_dashboard_stats()
RETURNS JSON
LANGUAGE plpgsql
AS $$
DECLARE
    -- Orders
    total_orders INT;
    today_orders INT;
    pending_orders INT;
    allocated_orders INT;
    ready_orders INT;
    picking_orders INT;
    packed_orders INT;
    shipped_orders INT;
    
    -- Jobs
    total_jobs INT;
    active_jobs INT;
    completed_jobs INT;
    
    -- Inventory
    sku_count INT;
    piece_qty BIGINT := 0;
    bulk_in_boxes_qty BIGINT := 0;
    bulk_table_qty BIGINT := 0;
    
    -- Box Stats
    storage_boxes INT;
    outboxes_count INT;
    
    -- Result
    result JSON;
BEGIN
    -- 1. Order Stats
    SELECT COUNT(*) INTO total_orders FROM outbound_orders;
    SELECT COUNT(*) INTO today_orders FROM outbound_orders WHERE created_at >= CURRENT_DATE;
    SELECT COUNT(*) INTO pending_orders FROM outbound_orders WHERE status = 'PENDING';
    SELECT COUNT(*) INTO allocated_orders FROM outbound_orders WHERE status = 'ALLOCATED';
    SELECT COUNT(*) INTO ready_orders FROM outbound_orders WHERE status = 'READY';
    SELECT COUNT(*) INTO picking_orders FROM outbound_orders WHERE status = 'PICKING';
    SELECT COUNT(*) INTO packed_orders FROM outbound_orders WHERE status = 'PACKED';
    SELECT COUNT(*) INTO shipped_orders FROM outbound_orders WHERE status = 'SHIPPED';
    
    -- 2. Job Stats
    SELECT COUNT(*) INTO total_jobs FROM picking_jobs;
    SELECT COUNT(*) INTO active_jobs FROM picking_jobs WHERE status IN ('PLANNED', 'IN_PROGRESS', 'OPEN');
    SELECT COUNT(*) INTO completed_jobs FROM picking_jobs WHERE status = 'COMPLETED';
    
    -- 3. Inventory Stats
    SELECT COUNT(*) INTO sku_count FROM products;
    
    -- Complex Inventory Logic (replicated from JS)
    -- Get pieces in boxes that are NOT BULK type
    SELECT COALESCE(SUM(ii.quantity), 0)
    INTO piece_qty
    FROM inventory_items ii
    JOIN boxes b ON ii.box_id = b.id
    WHERE b.inventory_type != 'BULK' OR b.inventory_type IS NULL;
    
    -- Get pieces in BULK boxes (if any logic put pieces there)
    SELECT COALESCE(SUM(ii.quantity), 0)
    INTO bulk_in_boxes_qty
    FROM inventory_items ii
    JOIN boxes b ON ii.box_id = b.id
    WHERE b.inventory_type = 'BULK';
    
    -- Get pure bulk inventory
    SELECT COALESCE(SUM(quantity), 0) INTO bulk_table_qty FROM bulk_inventory;
    
    -- 4. Box Stats
    SELECT COUNT(*) INTO storage_boxes FROM boxes WHERE type = 'STORAGE';
    SELECT COUNT(*) INTO outboxes_count FROM boxes WHERE type = 'OUTBOX';

    result := json_build_object(
        'orders', json_build_object(
            'total', total_orders,
            'today', today_orders,
            'pending', pending_orders,
            'allocated', allocated_orders,
            'ready', ready_orders,
            'picking', picking_orders,
            'packed', packed_orders,
            'shipped', shipped_orders
        ),
        'jobs', json_build_object(
            'total', total_jobs,
            'active', active_jobs,
            'completed', completed_jobs
        ),
        'inventory', json_build_object(
            'skus', sku_count,
            'totalItems', piece_qty + bulk_table_qty + bulk_in_boxes_qty,
            'totalPieceItems', piece_qty,
            'totalBulkItems', bulk_table_qty + bulk_in_boxes_qty,
            'storageBoxes', storage_boxes,
            'outboxes', outboxes_count
        )
    );
    
    RETURN result;
END;
$$;
