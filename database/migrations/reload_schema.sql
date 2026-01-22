-- Force PostgREST to reload its schema cache
-- This is necessary when functions change signatures (drop/create)
NOTIFY pgrst, 'reload schema';
