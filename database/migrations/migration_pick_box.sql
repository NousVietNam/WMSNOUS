-- Add box_id to picking_jobs to support 'Pick Box' tasks
ALTER TABLE picking_jobs ADD COLUMN IF NOT EXISTS box_id UUID REFERENCES boxes(id);

-- Add 'type' to classify picking jobs (e.g., 'BATCH_PICK', 'BOX_PICK')
ALTER TABLE picking_jobs ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'ORDER_PICK';
