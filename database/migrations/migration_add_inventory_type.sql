ALTER TABLE public.boxes
ADD COLUMN IF NOT EXISTS inventory_type TEXT DEFAULT 'PIECE';

COMMENT ON COLUMN public.boxes.inventory_type IS 'PIECE (Standard) or BULK (Bulk)';