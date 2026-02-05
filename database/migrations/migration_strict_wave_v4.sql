
-- FINAL FIX: Strict Wave Recommendation
-- This script ensures suggest_bulk_waves ONLY picks PENDING & APPROVED orders.

-- 1. Drop old versions to avoid conflicts
DROP FUNCTION IF EXISTS suggest_bulk_waves(FLOAT, INT);

-- 2. Clean up any accidental 'APPROVED' status one more time
UPDATE outbound_orders 
SET status = 'PENDING', is_approved = TRUE 
WHERE status = 'APPROVED';

-- 3. Create the Strict RPC
CREATE OR REPLACE FUNCTION suggest_bulk_waves_v4(
    p_min_similarity FLOAT DEFAULT 0.2,
    p_max_orders INT DEFAULT 40
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_clusters JSONB := '[]'::JSONB;
    v_unassigned_ids UUID[];
    v_seed_id UUID;
    v_current_cluster JSONB;
    v_size_bucket TEXT;
    v_seed_skus UUID[];
    v_candidate RECORD;
    v_intersection INT;
    v_union INT;
    v_score FLOAT;
    
    -- Metrics
    v_cluster_total_items INT;
    v_cluster_unique_skus INT;
    v_top_skus TEXT;
BEGIN
    -- 1. Get all eligible orders (BULK, PENDING, APPROVED, Unallocated)
    -- We are VERY strict here.
    SELECT array_agg(id) INTO v_unassigned_ids
    FROM outbound_orders
    WHERE inventory_type = 'BULK'
      AND status = 'PENDING'
      AND is_approved = TRUE
      AND wave_id IS NULL;

    IF v_unassigned_ids IS NULL OR array_length(v_unassigned_ids, 1) = 0 THEN
        RETURN '[]'::JSONB;
    END IF;

    -- LOOP until no unassigned orders left or too many clusters
    WHILE array_length(v_unassigned_ids, 1) > 0 AND jsonb_array_length(v_clusters) < 20 LOOP
    
        -- 2. Pick SEED: Largest order by total items
        WITH order_metrics AS (
             SELECT o.id, 
                    COALESCE(SUM(ooi.quantity), 0) as total_items,
                    array_agg(ooi.product_id) as skus
             FROM outbound_orders o
             JOIN outbound_order_items ooi ON o.id = ooi.order_id
             WHERE o.id = ANY(v_unassigned_ids)
             GROUP BY o.id
        )
        SELECT id, 
               CASE 
                   WHEN total_items < 50 THEN 'XS'
                   WHEN total_items < 500 THEN 'S'
                   WHEN total_items < 5000 THEN 'M'
                   ELSE 'L'
               END as bucket,
               skus
        INTO v_seed_id, v_size_bucket, v_seed_skus
        FROM order_metrics
        ORDER BY total_items DESC
        LIMIT 1;

        IF v_seed_id IS NULL THEN EXIT; END IF;

        -- Create new Cluster with Seed
        v_current_cluster := jsonb_build_array(v_seed_id);
        
        -- Remove Seed from Pool
        v_unassigned_ids := array_remove(v_unassigned_ids, v_seed_id);
        
        -- 3. Find Matches (Iterative Scan)
        -- We loop through a SNAPSHOT of the unassigned list to find matches for this cluster
        FOR v_candidate IN 
            WITH candidate_metrics AS (
                SELECT o.id, 
                       COALESCE(SUM(ooi.quantity), 0) as total_items,
                       array_agg(ooi.product_id) as skus
                FROM outbound_orders o
                JOIN outbound_order_items ooi ON o.id = ooi.order_id
                WHERE o.id = ANY(v_unassigned_ids)
                GROUP BY o.id
            )
            SELECT id, skus
            FROM candidate_metrics
            WHERE (
                  CASE 
                      WHEN total_items < 50 THEN 'XS'
                      WHEN total_items < 500 THEN 'S'
                      WHEN total_items < 5000 THEN 'M'
                      ELSE 'L'
                  END
              ) = v_size_bucket
        LOOP
            -- Jaccard Similarity Calculation
            SELECT COUNT(*) INTO v_intersection
            FROM unnest(v_seed_skus) s1
            JOIN unnest(v_candidate.skus) s2 ON s1 = s2;
            
            SELECT COUNT(DISTINCT s) INTO v_union
            FROM (
                SELECT unnest(v_seed_skus) as s
                UNION
                SELECT unnest(v_candidate.skus) as s
            ) t;
            
            v_score := v_intersection::FLOAT / NULLIF(v_union, 0)::FLOAT;
            
            -- If Good Match, Add to Cluster
            IF v_score >= p_min_similarity THEN
                v_current_cluster := v_current_cluster || to_jsonb(v_candidate.id);
                v_unassigned_ids := array_remove(v_unassigned_ids, v_candidate.id);
                
                -- Stop if max reached for this wave
                IF jsonb_array_length(v_current_cluster) >= p_max_orders THEN
                    EXIT;
                END IF;
            END IF;
        END LOOP;

        -- 4. Calculate Cluster Metrics (Total Qty, SKUs, Top items)
        SELECT 
             COALESCE(SUM(quantity), 0),
             COUNT(DISTINCT product_id)
        INTO v_cluster_total_items, v_cluster_unique_skus
        FROM outbound_order_items
        WHERE order_id IN (SELECT value::UUID FROM jsonb_array_elements_text(v_current_cluster));
        
        -- Top 3 SKUs for UI
        SELECT string_agg(sku, ', ') INTO v_top_skus
        FROM (
            SELECT p.sku
            FROM outbound_order_items ooi
            JOIN products p ON ooi.product_id = p.id
            WHERE ooi.order_id IN (SELECT value::UUID FROM jsonb_array_elements_text(v_current_cluster))
            GROUP BY p.sku
            ORDER BY SUM(ooi.quantity) DESC
            LIMIT 3
        ) t;

        -- Add Cluster to Result
        v_clusters := v_clusters || jsonb_build_object(
            'bucket', v_size_bucket,
            'orders', v_current_cluster,
            'count', jsonb_array_length(v_current_cluster),
            'total_items', v_cluster_total_items,
            'unique_skus', v_cluster_unique_skus,
            'top_skus', v_top_skus
        );

    END LOOP;

    RETURN v_clusters;
END;
$$;
