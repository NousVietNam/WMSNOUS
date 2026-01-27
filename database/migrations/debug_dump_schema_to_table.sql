
CREATE TABLE IF NOT EXISTS debug_schema_dump (info text);
DELETE FROM debug_schema_dump;

DO $$
DECLARE
    v_def text;
    v_col text;
BEGIN
    SELECT view_definition INTO v_def FROM information_schema.views WHERE table_name = 'view_product_availability';
    INSERT INTO debug_schema_dump VALUES ('VIEW_DEF: ' || COALESCE(v_def, 'NOT FOUND'));

    FOR v_col IN SELECT column_name || ' ' || data_type FROM information_schema.columns WHERE table_name = 'bulk_inventory' LOOP
        INSERT INTO debug_schema_dump VALUES ('COL: ' || v_col);
    END LOOP;
END $$;
