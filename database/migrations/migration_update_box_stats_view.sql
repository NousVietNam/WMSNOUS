-- Update box_stats view to include bulk_inventory items
-- This fixes the issue where boxes containing only bulk items (like INB boxes) showed 0 items on the map.

CREATE OR REPLACE VIEW box_stats AS
WITH item_counts AS (
    SELECT box_id, SUM(quantity) as qty, COUNT(id) as cnt
    FROM inventory_items
    GROUP BY box_id
),
bulk_counts AS (
    SELECT box_id, SUM(quantity) as qty, COUNT(id) as cnt
    FROM bulk_inventory
    WHERE box_id IS NOT NULL
    GROUP BY box_id
)
SELECT 
    b.id,
    b.code,
    COALESCE(i.qty, 0) + COALESCE(bk.qty, 0) as total_items,
    COALESCE(i.cnt, 0) + COALESCE(bk.cnt, 0) as distinct_items
FROM boxes b
LEFT JOIN item_counts i ON i.box_id = b.id
LEFT JOIN bulk_counts bk ON bk.box_id = b.id;
