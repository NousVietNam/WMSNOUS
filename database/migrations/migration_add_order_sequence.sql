-- Create sequence for outbound orders
CREATE SEQUENCE IF NOT EXISTS outbound_order_seq START 1;

-- Function to generate next order code (Format: 00001)
-- Function to generate next order code (Format: PREFIX-MMyy-00001)
CREATE OR REPLACE FUNCTION generate_outbound_order_code(prefix TEXT)
RETURNS TEXT AS $$
DECLARE
    seq_val BIGINT;
    mmyy TEXT;
BEGIN
    seq_val := nextval('outbound_order_seq');
    mmyy := to_char(now(), 'MMyy');

    -- Returns PREFIX-MMyy-00001
    -- If prefix is empty/null, returns MMyy-00001
    IF prefix IS NULL OR prefix = '' THEN
        RETURN mmyy || '-' || LPAD(seq_val::TEXT, 5, '0');
    ELSE
        RETURN prefix || '-' || mmyy || '-' || LPAD(seq_val::TEXT, 5, '0');
    END IF;
END;
$$ LANGUAGE plpgsql;
