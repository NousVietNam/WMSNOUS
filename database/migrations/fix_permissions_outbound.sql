-- 1. Create Sequence explicitly (Safe to run if exists)
CREATE SEQUENCE IF NOT EXISTS seq_pxk_code;

-- 2. Grant permissions for Outbound Shipments Table
GRANT ALL ON TABLE outbound_shipments TO service_role;
GRANT ALL ON TABLE outbound_shipments TO postgres;
GRANT SELECT, INSERT, UPDATE ON TABLE outbound_shipments TO authenticated;

-- 3. Grant permissions for PXK Sequence
GRANT ALL ON SEQUENCE seq_pxk_code TO service_role;
GRANT ALL ON SEQUENCE seq_pxk_code TO postgres;
GRANT USAGE, SELECT ON SEQUENCE seq_pxk_code TO authenticated;

-- 4. Enable RLS and Policies
ALTER TABLE outbound_shipments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow read access for authenticated users" ON outbound_shipments;
CREATE POLICY "Allow read access for authenticated users" ON outbound_shipments
FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow insert access for authenticated users" ON outbound_shipments;
CREATE POLICY "Allow insert access for authenticated users" ON outbound_shipments
FOR INSERT TO authenticated WITH CHECK (true);
