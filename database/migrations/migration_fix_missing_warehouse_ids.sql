-- Fix NULL warehouse_id in inventory_items based on boxes or direct locations
UPDATE inventory_items ii
SET warehouse_id = COALESCE(
    (SELECT warehouse_id FROM locations l WHERE l.id = ii.location_id),
    (SELECT l.warehouse_id FROM boxes b JOIN locations l ON b.location_id = l.id WHERE b.id = ii.box_id)
)
WHERE warehouse_id IS NULL;

-- Fix NULL warehouse_id in bulk_inventory based on boxes or direct locations
UPDATE bulk_inventory bi
SET warehouse_id = COALESCE(
    (SELECT warehouse_id FROM locations l WHERE l.id = bi.location_id),
    (SELECT l.warehouse_id FROM boxes b JOIN locations l ON b.location_id = l.id WHERE b.id = bi.box_id)
)
WHERE warehouse_id IS NULL;

-- Ensure BOX-00031 prefix always points to BULK warehouse if not already set correctly
-- BULK WH ID: f5ab6f3d-496f-4cce-b6b4-8c38c916b91d
UPDATE inventory_items ii
SET warehouse_id = 'f5ab6f3d-496f-4cce-b6b4-8c38c916b91d'
FROM boxes b
WHERE ii.box_id = b.id 
AND b.code ILIKE 'BOX-00031%'
AND ii.warehouse_id != 'f5ab6f3d-496f-4cce-b6b4-8c38c916b91d';

UPDATE bulk_inventory bi
SET warehouse_id = 'f5ab6f3d-496f-4cce-b6b4-8c38c916b91d'
FROM boxes b
WHERE bi.box_id = b.id 
AND b.code ILIKE 'BOX-00031%'
AND bi.warehouse_id != 'f5ab6f3d-496f-4cce-b6b4-8c38c916b91d';
