-- Migration: Add box_id column to bulk_inventory table

-- 1. Add column if it doesn't exist
ALTER TABLE public.bulk_inventory
ADD COLUMN IF NOT EXISTS box_id uuid REFERENCES public.boxes(id);

-- 2. Add comment for clarity
COMMENT ON COLUMN public.bulk_inventory.box_id IS 'Reference to the box this bulk inventory unit belongs to (if applicable)';

-- 3. Create index for performance
CREATE INDEX IF NOT EXISTS idx_bulk_inventory_box_id ON public.bulk_inventory(box_id);

-- Optional: If you want to enforce that it must trigger something, but for now just adding the column is safe.
