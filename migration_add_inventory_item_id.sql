
-- Add inventory_item_id to picking_tasks
ALTER TABLE picking_tasks 
ADD COLUMN IF NOT EXISTS inventory_item_id UUID REFERENCES inventory_items(id);

-- Also ensure box_id exists just in case
ALTER TABLE picking_tasks 
ADD COLUMN IF NOT EXISTS box_id UUID REFERENCES boxes(id);

-- And location_id
ALTER TABLE picking_tasks 
ADD COLUMN IF NOT EXISTS location_id UUID REFERENCES locations(id);
