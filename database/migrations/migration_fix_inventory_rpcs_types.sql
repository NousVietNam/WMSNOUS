
-- DROP OLD FUNCTIONS FIRST (Exact Signatures)
DROP FUNCTION IF EXISTS get_inventory_grouped(INT, INT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS get_inventory_bulk_grouped(INT, INT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT);


-- 1. Update RETAIL Grouped RPC (get_inventory_grouped)
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
    total_count BIGINT
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
        SELECT 
            ooi.product_id,
            SUM(CASE WHEN o.type = 'SALE' THEN ooi.quantity ELSE 0 END) as s_sale,
            SUM(CASE WHEN o.type = 'GIFT' THEN ooi.quantity ELSE 0 END) as s_gift,
            SUM(CASE WHEN o.type = 'INTERNAL' THEN ooi.quantity ELSE 0 END) as s_internal,
            SUM(CASE WHEN o.type = 'TRANSFER' THEN ooi.quantity ELSE 0 END) as s_transfer
        FROM outbound_order_items ooi
        JOIN outbound_orders o ON ooi.order_id = o.id
        WHERE o.is_approved = TRUE 
          AND (o.inventory_type = 'PIECE' OR o.inventory_type IS NULL) -- <=== CORRECT FILTER FOR RETAIL
          AND o.status IN ('PENDING')
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


-- 2. Update BULK Grouped RPC (get_inventory_bulk_grouped)
CREATE OR REPLACE FUNCTION get_inventory_bulk_grouped(
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
    total_count BIGINT
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
            bi.product_id,
            SUM(bi.quantity) as qty,
            SUM(COALESCE(bi.allocated_quantity, 0)) as alloc,
            JSONB_AGG(
                JSONB_BUILD_OBJECT(
                    'quantity', bi.quantity,
                    'boxes', CASE WHEN b.id IS NOT NULL THEN JSONB_BUILD_OBJECT('code', b.code, 'locations', CASE WHEN l_box.id IS NOT NULL THEN JSONB_BUILD_OBJECT('code', l_box.code) ELSE NULL END) ELSE NULL END
                )
            ) as loc_details
        FROM bulk_inventory bi
        JOIN products p ON bi.product_id = p.id
        LEFT JOIN boxes b ON bi.box_id = b.id
        LEFT JOIN locations l_box ON b.location_id = l_box.id
        WHERE 
            bi.quantity > 0
            AND (p_brand IS NULL OR p.brand = p_brand)
            AND (p_target_audience IS NULL OR p.target_audience = p_target_audience)
            AND (p_product_group IS NULL OR p.product_group = p_product_group)
            AND (p_season IS NULL OR p.season = p_season)
            AND (p_launch_month IS NULL OR (p.launch_month ~ '^[0-9]+$' AND p.launch_month::INT::TEXT = p_launch_month))
            AND (p_location_code IS NULL OR l_box.code = p_location_code)
            AND (p_box_code IS NULL OR b.code = p_box_code)
            AND (p_search IS NULL OR (
                p.name ILIKE '%' || p_search || '%' OR 
                p.sku ILIKE '%' || p_search || '%' OR 
                (p.barcode IS NOT NULL AND p.barcode ILIKE '%' || p_search || '%') OR
                (b.code IS NOT NULL AND b.code ILIKE '%' || p_search || '%')
            ))
        GROUP BY bi.product_id
    ),
    soft_stats AS (
        SELECT 
            ooi.product_id,
            SUM(CASE WHEN o.type = 'SALE' THEN ooi.quantity ELSE 0 END) as s_sale,
            SUM(CASE WHEN o.type = 'GIFT' THEN ooi.quantity ELSE 0 END) as s_gift,
            SUM(CASE WHEN o.type = 'INTERNAL' THEN ooi.quantity ELSE 0 END) as s_internal,
            SUM(CASE WHEN o.type = 'TRANSFER' THEN ooi.quantity ELSE 0 END) as s_transfer
        FROM outbound_order_items ooi
        JOIN outbound_orders o ON ooi.order_id = o.id
        WHERE o.is_approved = TRUE 
          AND o.inventory_type = 'BULK' -- <=== CORRECT FILTER FOR BULK
          AND o.status IN ('PENDING')
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
