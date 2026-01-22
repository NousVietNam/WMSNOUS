-- =================================================================
-- REPAIR SCRIPT: Synchronize Box Status for Existing Approved Orders
-- Description:
-- Finds all boxes that SHOULD be locked (because they are part of an 
-- Approved/Allocated order) but are currently OPEN or not linked.
-- =================================================================

BEGIN;

-- 1. Lock boxes for Sales/Transfers that are Approved but not yet Shipped
UPDATE boxes b
SET status = 'LOCKED',
    outbound_order_id = sub.order_id,
    updated_at = NOW()
FROM (
    SELECT DISTINCT ooi.from_box_id, o.id as order_id
    FROM outbound_orders o
    JOIN outbound_order_items ooi ON o.id = ooi.order_id
    WHERE o.is_approved = TRUE
      AND o.status NOT IN ('SHIPPED', 'COMPLETED', 'CANCELLED')
      AND ooi.from_box_id IS NOT NULL
) sub
WHERE b.id = sub.from_box_id
  AND (b.status != 'LOCKED' OR b.outbound_order_id IS DISTINCT FROM sub.order_id);

-- 2. Log the repair for audit
DO $$
DECLARE
    v_count INT;
BEGIN
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RAISE NOTICE 'Repaired box status for % boxes.', v_count;
END $$;

COMMIT;
