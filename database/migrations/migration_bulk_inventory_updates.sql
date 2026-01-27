
-- Add allocated_quantity to bulk_inventory if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bulk_inventory' AND column_name = 'allocated_quantity') THEN
        ALTER TABLE bulk_inventory ADD COLUMN allocated_quantity INTEGER DEFAULT 0;
    END IF;
END $$;

-- Drop view if exists to ensure clean slate
DROP VIEW IF EXISTS view_product_availability_bulk;

-- Create view_product_availability_bulk
CREATE OR REPLACE VIEW view_product_availability_bulk AS
SELECT
    bi.product_id,
    p.sku,
    p.name,
    p.image_url,
    p.barcode,
    SUM(bi.quantity) as total_quantity,
    SUM(COALESCE(bi.allocated_quantity, 0)) as total_allocated,
    SUM(bi.quantity - COALESCE(bi.allocated_quantity, 0)) as available_quantity
FROM bulk_inventory bi
JOIN products p ON bi.product_id = p.id
GROUP BY bi.product_id, p.sku, p.name, p.image_url, p.barcode;

-- Grant permissions (optional but good practice)
GRANT SELECT ON view_product_availability_bulk TO authenticated;
GRANT SELECT ON view_product_availability_bulk TO service_role;
