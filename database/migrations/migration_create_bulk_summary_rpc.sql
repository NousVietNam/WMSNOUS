
-- Create RPC to get Global Totals for Bulk Inventory
-- Mirrored from get_inventory_summary but uses bulk_inventory table

CREATE OR REPLACE FUNCTION get_inventory_bulk_summary(
    p_warehouse_id uuid DEFAULT NULL,
    p_location_code text DEFAULT NULL,
    p_box_code text DEFAULT NULL,
    p_brand text DEFAULT NULL,
    p_target_audience text DEFAULT NULL,
    p_product_group text DEFAULT NULL,
    p_season text DEFAULT NULL,
    p_launch_month text DEFAULT NULL,
    p_search text DEFAULT NULL
) RETURNS TABLE (
    total_quantity numeric,
    total_allocated numeric,
    total_approved_sale numeric,
    total_approved_gift numeric,
    total_approved_internal numeric,
    total_approved_transfer numeric,
    available_detail numeric,
    available_summary numeric
) AS $$
BEGIN
    RETURN QUERY
    WITH filtered_products AS (
        SELECT p.id
        FROM products p
        WHERE 
            (p_brand IS NULL OR p.brand = p_brand) AND
            (p_target_audience IS NULL OR p.target_audience = p_target_audience) AND
            (p_product_group IS NULL OR p.product_group = p_product_group) AND
            (p_season IS NULL OR p.season = p_season) AND
            (p_launch_month IS NULL OR p.launch_month = p_launch_month) AND
            (
                p_search IS NULL OR 
                p.sku ILIKE '%' || p_search || '%' OR 
                p.name ILIKE '%' || p_search || '%' OR
                p.barcode ILIKE '%' || p_search || '%'
            )
    ),
    bulk_stats AS (
        SELECT 
            COALESCE(SUM(bi.quantity), 0) as qty,
            COALESCE(SUM(bi.allocated_quantity), 0) as alloc
        FROM bulk_inventory bi
        JOIN boxes b ON bi.box_id = b.id
        LEFT JOIN locations l ON b.location_id = l.id
        WHERE 
            bi.product_id IN (SELECT id FROM filtered_products) AND
            (p_warehouse_id IS NULL OR b.warehouse_id = p_warehouse_id) AND
            (p_location_code IS NULL OR l.code = p_location_code) AND
            (p_box_code IS NULL OR b.code = p_box_code)
    ),
    soft_stats AS (
        -- Soft allocation is per Product.
        -- If filtering by Warehouse/Location, Soft Allocation (Order demand) usually DOES NOT filter by location 
        -- until hard allocated. But for "Summary Availability", we usually subtract global soft demand?
        -- OR, does the existing logic filter soft demand?
        -- Assumption: Soft demand is Global. 
        -- BUT if I filter for Warehouse A, and I have 0 stock in A, but 100 demand globally, Available should be 0 (or negative?).
        -- For simplicity and mirroring bulk behavior:
        -- We sum up Soft Stats for the filtered PRODUCTS regardless of warehouse (since demand is on product).
        SELECT 
            COALESCE(SUM(v.soft_booked_sale), 0) as soft_sale,
            COALESCE(SUM(v.soft_booked_gift), 0) as soft_gift,
            COALESCE(SUM(v.soft_booked_internal), 0) as soft_internal,
            COALESCE(SUM(v.soft_booked_transfer), 0) as soft_transfer
        FROM view_product_availability_bulk v
        WHERE v.product_id IN (SELECT id FROM filtered_products)
    )
    SELECT 
        (SELECT qty FROM bulk_stats)::numeric,
        (SELECT alloc FROM bulk_stats)::numeric,
        (SELECT soft_sale FROM soft_stats)::numeric,
        (SELECT soft_gift FROM soft_stats)::numeric,
        (SELECT soft_internal FROM soft_stats)::numeric,
        (SELECT soft_transfer FROM soft_stats)::numeric,
        
        -- available_detail = Total - Hard
        ((SELECT qty FROM bulk_stats) - (SELECT alloc FROM bulk_stats))::numeric,

        -- available_summary = Total - Hard - Soft
        ((SELECT qty FROM bulk_stats) - (SELECT alloc FROM bulk_stats) - 
         (SELECT soft_sale FROM soft_stats) - (SELECT soft_gift FROM soft_stats) - 
         (SELECT soft_internal FROM soft_stats) - (SELECT soft_transfer FROM soft_stats))::numeric
    ;
END;
$$ LANGUAGE plpgsql;
