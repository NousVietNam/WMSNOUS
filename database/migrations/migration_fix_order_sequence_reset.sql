-- Create a table to track monthly sequences if it doesn't exist
CREATE TABLE IF NOT EXISTS order_sequences (
    month_key TEXT PRIMARY KEY, -- Format: MMyy
    current_val INTEGER DEFAULT 0
);

-- Updated function to generate order code with monthly reset
CREATE OR REPLACE FUNCTION generate_outbound_order_code(prefix TEXT)
RETURNS TEXT AS $$
DECLARE
    mmyy TEXT;
    seq_val INTEGER;
BEGIN
    -- Get current Month-Year (e.g., '0226')
    mmyy := to_char(now(), 'MMyy');

    -- Insert a new record for this month if not exists, do nothing if it does
    INSERT INTO order_sequences (month_key, current_val)
    VALUES (mmyy, 0)
    ON CONFLICT (month_key) DO NOTHING;

    -- Increment the sequence for this month
    UPDATE order_sequences
    SET current_val = current_val + 1
    WHERE month_key = mmyy
    RETURNING current_val INTO seq_val;

    -- Returns PREFIX-MMyy-Sequence (e.g., SO-0226-00001)
    IF prefix IS NULL OR prefix = '' THEN
        RETURN mmyy || '-' || LPAD(seq_val::TEXT, 5, '0');
    ELSE
        RETURN prefix || '-' || mmyy || '-' || LPAD(seq_val::TEXT, 5, '0');
    END IF;
END;
$$ LANGUAGE plpgsql;
