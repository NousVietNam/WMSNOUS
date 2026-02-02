
-- Smart Wave Suggestion RPC
-- Logic: Iterative Clustering (Size Bucketing + SKU Overlap)

CREATE OR REPLACE FUNCTION suggest_bulk_waves(
    p_min_similarity FLOAT DEFAULT 0.3,
    p_max_orders INT DEFAULT 50
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
BEGIN
    -- 1. Get all eligible orders (BULK, APPROVED, Unallocated, No Wave)
    SELECT array_agg(id) INTO v_unassigned_ids
    FROM outbound_orders
    WHERE inventory_type = 'BULK'
      -- AND status = 'APPROVED' -- REMOVED: User confirmed Pending is OK if Approved flag is set
      AND (wave_id IS NULL)
      AND is_approved = TRUE; -- Key condition

    IF v_unassigned_ids IS NULL THEN
        RETURN '[]'::JSONB;
    END IF;

    -- LOOP until no unassigned orders left
    WHILE array_length(v_unassigned_ids, 1) > 0 LOOP
    
        -- 2. Pick SEED: Largest order by total items (Priority on big orders)
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

        -- Create new Cluster with Seed
        v_current_cluster := jsonb_build_array(v_seed_id);
        
        -- Remove Seed from Pool
        v_unassigned_ids := array_remove(v_unassigned_ids, v_seed_id);
        
        -- 3. Find Matches (Iterative)
        -- Scan remaining pool for matches
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
            -- Intersection
            SELECT COUNT(*) INTO v_intersection
            FROM unnest(v_seed_skus) s1
            JOIN unnest(v_candidate.skus) s2 ON s1 = s2;
            
            -- Union
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
                
                -- Expand Seed SKUs (Greedy Growth): Add new SKUs to the profile to attract more related orders
                -- v_seed_skus := array_cat(v_seed_skus, v_candidate.skus); -- Optional: Enables "Chain" matching
                
                -- Stop if max reached
                IF jsonb_array_length(v_current_cluster) >= p_max_orders THEN
                    EXIT;
                END IF;
            END IF;
        END LOOP;

        -- Add Cluster to Result
        v_clusters := v_clusters || jsonb_build_object(
            'bucket', v_size_bucket,
            'orders', v_current_cluster,
            'count', jsonb_array_length(v_current_cluster)
        );

    END LOOP;

    RETURN v_clusters;
END;
$$;
