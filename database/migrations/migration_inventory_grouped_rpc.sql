-- =====================================================
-- Migration: Inventory Grouped RPC
-- Description: 
-- Provide a server-side grouped view of inventory by Product.
-- Supports dynamic filtering (Warehouse, Location, Brand, etc.)
-- Consistent with 'view_product_availability' logic but suitable for paginated UI with filters.
-- =====================================================

-- Drop old function first to allow return type change
DROP FUNCTION IF EXISTS get_inventory_grouped(INT, INT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION get_inventory_grouped(
    p_page INT,
    p_page_size INT,
    p_warehouse_id UUID DEFAULT NULL,
    p_location_code TEXT DEFAULT NULL,
    p_box_code TEXT DEFAULT NULL,
    p_brand TEXT DEFAULT NULL,
    p_target_audience TEXT DEFAULT NULL,
    p_product_group TEXT DEFAULT NULL,
    p_season TEXT DEFAULT NULL,
    p_launch_month TEXT DEFAULT NULL,
    p_search TEXT DEFAULT NULL
)
RETURNS TABLE (
    product_id UUID,
    sku TEXT,
    name TEXT,
    barcode TEXT,
    image_url TEXT,
    brand TEXT,
    target_audience TEXT,
    product_group TEXT,
    season TEXT,
    launch_month TEXT,
    total_quantity BIGINT,
    total_allocated BIGINT,
    soft_sale BIGINT,
    soft_gift BIGINT,
    soft_internal BIGINT,
    soft_transfer BIGINT,
    available_quantity BIGINT,
    location_details JSONB,
    total_count BIGINT -- For pagination
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_offset INT;
BEGIN
    v_offset := p_page * p_page_size;

    RETURN QUERY
    WITH filtered_items AS (
        SELECT 
            ii.product_id,
            SUM(ii.quantity) as qty,
            SUM(COALESCE(ii.allocated_quantity, 0)) as alloc,
            -- Aggregating details for popup
            JSONB_AGG(
                JSONB_BUILD_OBJECT(
                    'quantity', ii.quantity,
                    'boxes', CASE WHEN b.id IS NOT NULL THEN JSONB_BUILD_OBJECT('code', b.code, 'locations', CASE WHEN l_box.id IS NOT NULL THEN JSONB_BUILD_OBJECT('code', l_box.code) ELSE NULL END) ELSE NULL END,
                    'locations', CASE WHEN l_direct.id IS NOT NULL THEN JSONB_BUILD_OBJECT('code', l_direct.code) ELSE NULL END
                )
            ) as loc_details
        FROM inventory_items ii
        JOIN products p ON ii.product_id = p.id
        LEFT JOIN boxes b ON ii.box_id = b.id
        LEFT JOIN locations l_box ON b.location_id = l_box.id
        LEFT JOIN locations l_direct ON ii.location_id = l_direct.id
        WHERE 
            ii.quantity > 0
            AND (p_warehouse_id IS NULL OR ii.warehouse_id = p_warehouse_id)
            AND (p_brand IS NULL OR p.brand = p_brand)
            AND (p_target_audience IS NULL OR p.target_audience = p_target_audience)
            AND (p_product_group IS NULL OR p.product_group = p_product_group)
            AND (p_season IS NULL OR p.season = p_season)
            -- Handle month comparison flexibly (treat '01' as '1')
            AND (p_launch_month IS NULL OR (p.launch_month ~ '^[0-9]+$' AND p.launch_month::INT::TEXT = p_launch_month))
            AND (p_location_code IS NULL OR COALESCE(l_box.code, l_direct.code) = p_location_code)
            AND (p_box_code IS NULL OR b.code = p_box_code)
            AND (p_search IS NULL OR (
                p.name ILIKE '%' || p_search || '%' OR 
                p.sku ILIKE '%' || p_search || '%' OR 
                (p.barcode IS NOT NULL AND p.barcode ILIKE '%' || p_search || '%') OR
                (b.code IS NOT NULL AND b.code ILIKE '%' || p_search || '%')
            ))
        GROUP BY ii.product_id
    ),
    soft_stats AS (
        -- Global Soft Allocation (Not filtered by Warehouse/Location as Demand is global)
        -- We just aggregate once per product.
        SELECT 
            ooi.product_id,
            SUM(CASE WHEN o.type = 'SALE' THEN ooi.quantity ELSE 0 END) as s_sale,
            SUM(CASE WHEN o.type = 'GIFT' THEN ooi.quantity ELSE 0 END) as s_gift,
            SUM(CASE WHEN o.type = 'INTERNAL' THEN ooi.quantity ELSE 0 END) as s_internal,
            SUM(CASE WHEN o.type = 'TRANSFER' THEN ooi.quantity ELSE 0 END) as s_transfer
        FROM outbound_order_items ooi
        JOIN outbound_orders o ON ooi.order_id = o.id
        WHERE o.is_approved = TRUE 
          AND o.status NOT IN ('ALLOCATED', 'PICKING', 'PACKED', 'SHIPPED', 'COMPLETED', 'CANCELLED')
        GROUP BY ooi.product_id
    ),
    total_cnt AS (
        SELECT COUNT(*) as cnt FROM filtered_items
    )
    SELECT
        p.id,
        p.sku,
        p.name,
        p.barcode,
        p.image_url,
    p.brand,
    p.target_audience,
    p.product_group,
    p.season,
    p.launch_month,
    COALESCE(fi.qty, 0)::BIGINT,
    COALESCE(fi.alloc, 0)::BIGINT,
    COALESCE(ss.s_sale, 0)::BIGINT,
    COALESCE(ss.s_gift, 0)::BIGINT,
    COALESCE(ss.s_internal, 0)::BIGINT,
    COALESCE(ss.s_transfer, 0)::BIGINT,
    -- Available = Filtered Total - Filtered Hard - Global Soft
    GREATEST(0, COALESCE(fi.qty, 0) - COALESCE(fi.alloc, 0) - COALESCE(ss.s_sale, 0) - COALESCE(ss.s_gift, 0) - COALESCE(ss.s_internal, 0) - COALESCE(ss.s_transfer, 0))::BIGINT,
    fi.loc_details,
    (SELECT cnt FROM total_cnt)::BIGINT
    FROM filtered_items fi
    JOIN products p ON fi.product_id = p.id
    LEFT JOIN soft_stats ss ON p.id = ss.product_id
    ORDER BY COALESCE(fi.qty, 0) DESC, p.sku ASC
    LIMIT p_page_size OFFSET v_offset;
END;
$$;
