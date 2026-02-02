
-- Phase 2: Wave Strategy Schema

-- 1. Create Wave Status Enum if not exists (checked manually or via loose type text)
-- We'll use text constraint for flexibility or create type. Let's use text with check for simplicity and easy updates.

CREATE TABLE pick_waves (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT UNIQUE NOT NULL, -- e.g. W-240130-001
    inventory_type TEXT NOT NULL CHECK (inventory_type IN ('PIECE', 'BULK')),
    status TEXT NOT NULL CHECK (status IN ('PLANNING', 'RELEASED', 'COMPLETED', 'CANCELLED')) DEFAULT 'PLANNING',
    
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    released_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    
    -- Snapshot metrics for quick UI loading
    total_orders INT DEFAULT 0,
    total_items INT DEFAULT 0,
    description TEXT
);

-- 2. Link Orders to Waves
ALTER TABLE outbound_orders 
ADD COLUMN wave_id UUID REFERENCES pick_waves(id) ON DELETE SET NULL;

-- 3. Trigger to update Wave Metrics automatically
CREATE OR REPLACE FUNCTION update_wave_metrics()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'DELETE' AND OLD.wave_id IS NOT NULL) THEN
        UPDATE pick_waves 
        SET total_orders = total_orders - 1,
            total_items = total_items - OLD.total_items
        WHERE id = OLD.wave_id;
    ELSIF (TG_OP = 'UPDATE') THEN
        -- If moved TO a wave
        IF (OLD.wave_id IS NULL AND NEW.wave_id IS NOT NULL) THEN
             UPDATE pick_waves 
             SET total_orders = total_orders + 1,
                 total_items = total_items + NEW.total_items
             WHERE id = NEW.wave_id;
        -- If moved FROM a wave
        ELSIF (OLD.wave_id IS NOT NULL AND NEW.wave_id IS NULL) THEN
             UPDATE pick_waves 
             SET total_orders = total_orders - 1,
                 total_items = total_items - NEW.total_items
             WHERE id = OLD.wave_id;
        -- If changed waves
        ELSIF (OLD.wave_id IS NOT NULL AND NEW.wave_id IS NOT NULL AND OLD.wave_id <> NEW.wave_id) THEN
             UPDATE pick_waves 
             SET total_orders = total_orders - 1,
                 total_items = total_items - OLD.total_items
             WHERE id = OLD.wave_id;
             UPDATE pick_waves 
             SET total_orders = total_orders + 1,
                 total_items = total_items + NEW.total_items
             WHERE id = NEW.wave_id;
        END IF;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_wave_metrics
AFTER UPDATE OF wave_id ON outbound_orders
FOR EACH ROW
EXECUTE FUNCTION update_wave_metrics();

-- Add Auto-Scan for DELETE/INSERT if needed, but usually we just UPDATE order->wave relationship.
-- Let's add simple RPC to create a wave efficiently.

CREATE OR REPLACE FUNCTION create_wave(
    p_inventory_type TEXT,
    p_user_id UUID,
    p_description TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_wave_id UUID;
    v_code TEXT;
BEGIN
    -- Generate Code: W-YYMMDD-XXXX
    v_code := 'W-' || to_char(NOW(), 'YYMMDD') || '-' || upper(substring(md5(random()::text) from 1 for 4));
    
    INSERT INTO pick_waves (code, inventory_type, created_by, description)
    VALUES (v_code, p_inventory_type, p_user_id, p_description)
    RETURNING id INTO v_wave_id;
    
    RETURN jsonb_build_object('success', true, 'wave_id', v_wave_id, 'code', v_code);
END;
$$;
