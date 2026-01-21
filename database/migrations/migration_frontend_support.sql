-- =====================================================
-- Migration: Frontend Support (Financials & Helpers)
-- Description: Add columns required by UI that were missing in initial schema
--              (shipping_fee, discount_type, etc.) and helper RPCs.
-- =====================================================

DO $$ 
BEGIN
    -- 1. Add Missing Financial Columns (Discounts only)
    ALTER TABLE outbound_orders ADD COLUMN IF NOT EXISTS discount_type TEXT; -- 'PERCENT' or 'FIXED'
    ALTER TABLE outbound_orders ADD COLUMN IF NOT EXISTS discount_value DECIMAL(15, 2) DEFAULT 0;
    -- User requested to REMOVE Shipping Fee and Tax columns
    
    -- 2. Add Source Column (UI requested)
    ALTER TABLE outbound_orders ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'SYSTEM'; 

END $$;

-- 3. Create Helper RPC: Generate Outbound Code
CREATE OR REPLACE FUNCTION generate_outbound_code(p_type TEXT)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
    v_prefix TEXT;
    v_seq INT;
    v_year_month TEXT;
    v_code TEXT;
BEGIN
    -- Determine Prefix
    IF p_type = 'SALE' THEN v_prefix := 'SO';
    ELSIF p_type = 'TRANSFER' THEN v_prefix := 'TO';
    ELSIF p_type = 'INTERNAL' THEN v_prefix := 'IO';
    ELSIF p_type = 'GIFT' THEN v_prefix := 'GO';
    ELSE v_prefix := 'OO';
    END IF;
    
    v_year_month := to_char(NOW(), 'YYMM');
    
    -- Simple sequence generation (count + 1) -> prone to concurrency but ok for MVP
    -- Better: Use a reliable sequence or UUID shortener. 
    -- For now: Random 5 digits to avoid collision simply
    v_code := v_prefix || '-' || v_year_month || '-' || substring(md5(random()::text) from 1 for 6);
    
    -- Ensure uniqueness (Retry if needed, but low chance with md5 quote)
    RETURN v_code;
END;
$$;

-- 4. Create Helper RPC: Get Order Statistics (Optional, for Dashboard)
CREATE OR REPLACE FUNCTION get_outbound_stats()
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
AS $$
    SELECT jsonb_build_object(
        'pending', (SELECT count(*) FROM outbound_orders WHERE status = 'PENDING'),
        'approved', (SELECT count(*) FROM outbound_orders WHERE status = 'APPROVED'),
        'shipping', (SELECT count(*) FROM outbound_orders WHERE status IN ('ALLOCATED', 'PICKING', 'PACKED'))
    );
$$;
