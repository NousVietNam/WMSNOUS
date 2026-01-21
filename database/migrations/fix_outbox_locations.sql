-- Update all Outboxes appearing to be missing a location to be at 'GATE-OUT'
UPDATE boxes 
SET location_id = (SELECT id FROM locations WHERE code = 'GATE-OUT' LIMIT 1)
WHERE type = 'OUTBOX' AND location_id IS NULL;
