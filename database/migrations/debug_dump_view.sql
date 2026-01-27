
-- Ensure table exists
CREATE TABLE IF NOT EXISTS public.debug_schema_info (
    id SERIAL PRIMARY KEY,
    content TEXT
);

-- Clear old data
TRUNCATE public.debug_schema_info;

-- Dump View Definition
DO $$
DECLARE
    v_def TEXT;
BEGIN
    SELECT view_definition INTO v_def 
    FROM information_schema.views 
    WHERE table_name = 'view_product_availability' 
    LIMIT 1;

    INSERT INTO public.debug_schema_info (content) 
    VALUES ('VIEW DEFINITION: ' || COALESCE(v_def, 'NOT FOUND IN DB'));
END $$;

-- Dump Column Information to be sure
INSERT INTO public.debug_schema_info (content)
SELECT 'COLUMN: ' || column_name || ' (' || data_type || ')'
FROM information_schema.columns
WHERE table_name = 'view_product_availability';

-- GRANT PERMISSIONS (Critical for API access)
GRANT ALL ON public.debug_schema_info TO postgres;
GRANT ALL ON public.debug_schema_info TO service_role;
GRANT SELECT ON public.debug_schema_info TO anon;
GRANT SELECT ON public.debug_schema_info TO authenticated;
