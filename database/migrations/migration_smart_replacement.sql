
-- RPC to suggest replacement boxes
CREATE OR REPLACE FUNCTION get_replacement_box_suggestions(
    p_product_id UUID,
    p_current_box_id UUID,
    p_required_qty INT
)
RETURNS TABLE (
    box_id UUID,
    box_code TEXT,
    available_qty INT,
    location_code TEXT,
    location_id UUID,
    distance_rank INT -- Simple ranking logic
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_current_location_code TEXT;
    v_current_zone TEXT;
BEGIN
    -- Get current box location info (simplified, assuming box code maps to location or has location_id)
    -- In this system, box code often IS the location or tied to it.
    SELECT code INTO v_current_location_code FROM boxes WHERE id = p_current_box_id;
    
    -- Extract Zone (First part of code split by '-')
    v_current_zone := split_part(v_current_location_code, '-', 1);

    RETURN QUERY
    SELECT 
        b.id as box_id,
        b.code as box_code,
        (i.quantity - COALESCE(i.allocated_quantity, 0))::INT as available_qty,
        b.code as location_code, -- Assuming box code is proxy for location
        b.location_id,
        -- Simple ranking (smaller is better). 
        -- 1. Same Zone (Priority High)
        -- 2. Sort by Code similarity (Lexical sort effectively groups nearby shelves)
        CASE 
            WHEN split_part(b.code, '-', 1) = v_current_zone THEN 1 
            ELSE 2 
        END as distance_rank
    FROM inventory_items i
    JOIN boxes b ON i.box_id = b.id
    WHERE i.product_id = p_product_id
      AND b.id != p_current_box_id -- Exclude current broken box
      AND b.status = 'OPEN' -- Only open boxes
      AND (i.quantity - COALESCE(i.allocated_quantity, 0)) >= p_required_qty -- Must have enough available
    ORDER BY 
        distance_rank ASC,
        ABS(LENGTH(b.code) - LENGTH(v_current_location_code)) ASC, -- Length similarity
        b.code ASC -- Lexical sort (A1-01 next to A1-02)
    LIMIT 10;
END;
$$;
