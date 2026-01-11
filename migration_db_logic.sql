-- 1. Add allocated_quantity to Inventory Items
ALTER TABLE "inventory_items"
ADD COLUMN IF NOT EXISTS "allocated_quantity" INTEGER DEFAULT 0;

-- 2. Trigger Function: Update Allocated Quantity when Picking Tasks change
CREATE OR REPLACE FUNCTION fn_update_inventory_allocation()
RETURNS TRIGGER AS $$
BEGIN
    -- If INSERT (New Task) -> Increment Allocated Quantity on specific Inventory Item
    IF (TG_OP = 'INSERT') THEN
        -- Link via box_id and product_id (Assuming 1-1 mapping for simplification in this logic)
        -- Or find strictly matching item in that box
        IF NEW.status IN ('PENDING', 'ASSIGNED', 'IN_PROGRESS') THEN
            UPDATE inventory_items
            SET allocated_quantity = allocated_quantity + NEW.quantity
            WHERE box_id = NEW.box_id AND product_id = NEW.product_id;
        END IF;

    -- If DELETE -> Decrement
    ELSIF (TG_OP = 'DELETE') THEN
        IF OLD.status IN ('PENDING', 'ASSIGNED', 'IN_PROGRESS') THEN
            UPDATE inventory_items
            SET allocated_quantity = allocated_quantity - OLD.quantity
            WHERE box_id = OLD.box_id AND product_id = OLD.product_id;
        END IF;

    -- If UPDATE (Status Change or Quantity Change)
    ELSIF (TG_OP = 'UPDATE') THEN
        -- Handle Status Change (e.g. PENDING -> COMPLETED/CANCELLED)
        -- If old was Reserved and new is NOT Reserved -> Release (Decrement)
        -- If old was NOT Reserved and new IS Reserved -> Reserve (Increment)
        
        DECLARE
            is_old_reserved BOOLEAN;
            is_new_reserved BOOLEAN;
        BEGIN
            is_old_reserved := OLD.status IN ('PENDING', 'ASSIGNED', 'IN_PROGRESS');
            is_new_reserved := NEW.status IN ('PENDING', 'ASSIGNED', 'IN_PROGRESS');

            -- Case 1: Status Changed affecting reservation
            IF (is_old_reserved AND NOT is_new_reserved) THEN
                 -- Released
                 UPDATE inventory_items
                 SET allocated_quantity = allocated_quantity - OLD.quantity
                 WHERE box_id = OLD.box_id AND product_id = OLD.product_id;
            
            ELSIF (NOT is_old_reserved AND is_new_reserved) THEN
                 -- Reserved
                 UPDATE inventory_items
                 SET allocated_quantity = allocated_quantity + NEW.quantity
                 WHERE box_id = NEW.box_id AND product_id = NEW.product_id;

            -- Case 2: Quantity Changed while Reserved
            ELSIF (is_new_reserved AND (OLD.quantity <> NEW.quantity)) THEN
                 UPDATE inventory_items
                 SET allocated_quantity = allocated_quantity + (NEW.quantity - OLD.quantity)
                 WHERE box_id = NEW.box_id AND product_id = NEW.product_id;
            END IF;
        END;
    END IF;
    RETURN NULL; -- After trigger, return null
END;
$$ LANGUAGE plpgsql;

-- 3. Create Trigger
DROP TRIGGER IF EXISTS tr_picking_allocation ON picking_tasks;
CREATE TRIGGER tr_picking_allocation
AFTER INSERT OR UPDATE OR DELETE ON picking_tasks
FOR EACH ROW EXECUTE FUNCTION fn_update_inventory_allocation();

-- 4. Unified Product Stock View
CREATE OR REPLACE VIEW view_product_stock AS
SELECT 
    p.id as product_id,
    p.sku,
    p.name,
    COALESCE(SUM(i.quantity), 0) as total_on_hand,
    COALESCE(SUM(i.allocated_quantity), 0) as total_allocated,
    COALESCE(SUM(i.quantity), 0) - COALESCE(SUM(i.allocated_quantity), 0) as available_quantity
FROM products p
LEFT JOIN inventory_items i ON i.product_id = p.id
GROUP BY p.id, p.sku, p.name;
