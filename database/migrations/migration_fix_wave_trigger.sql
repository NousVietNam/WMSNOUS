
-- Replace broken trigger with robust recalculation logic

CREATE OR REPLACE FUNCTION update_wave_metrics()
RETURNS TRIGGER AS $$
DECLARE
    v_wave_id UUID;
BEGIN
    -- Handle OLD Wave (Order removed from wave)
    IF (TG_OP = 'DELETE' OR TG_OP = 'UPDATE') AND OLD.wave_id IS NOT NULL THEN
        -- Recalculate OLD Wave
        UPDATE pick_waves 
        SET 
            total_orders = (
                SELECT COUNT(*) 
                FROM outbound_orders 
                WHERE wave_id = OLD.wave_id
            ),
            total_items = (
                SELECT COALESCE(SUM(ooi.quantity), 0)
                FROM outbound_orders oo
                JOIN outbound_order_items ooi ON oo.id = ooi.order_id
                WHERE oo.wave_id = OLD.wave_id
            )
        WHERE id = OLD.wave_id;
    END IF;

    -- Handle NEW Wave (Order added to wave)
    IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') AND NEW.wave_id IS NOT NULL THEN
        -- Check if we need to update (avoid double update if wave_id didn't change, but safer to just update)
        IF (TG_OP = 'UPDATE' AND OLD.wave_id IS NOT DISTINCT FROM NEW.wave_id) THEN
            -- Wave ID didn't change, usually no need to recalc unless we want to catch item qty changes
            -- But this trigger is on 'outbound_orders', so item qty changes wouldn't fire it anyway.
            -- So skip.
            RETURN NEW;
        END IF;

        -- Recalculate NEW Wave
        UPDATE pick_waves 
        SET 
            total_orders = (
                SELECT COUNT(*) 
                FROM outbound_orders 
                WHERE wave_id = NEW.wave_id
            ),
            total_items = (
                SELECT COALESCE(SUM(ooi.quantity), 0)
                FROM outbound_orders oo
                JOIN outbound_order_items ooi ON oo.id = ooi.order_id
                WHERE oo.wave_id = NEW.wave_id
            )
        WHERE id = NEW.wave_id;
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Ensure Trigger exists (Re-create to binding)
DROP TRIGGER IF EXISTS trigger_update_wave_metrics ON outbound_orders;

CREATE TRIGGER trigger_update_wave_metrics
AFTER UPDATE OF wave_id, status -- Added status just in case filtering changes
ON outbound_orders
FOR EACH ROW
EXECUTE FUNCTION update_wave_metrics();
