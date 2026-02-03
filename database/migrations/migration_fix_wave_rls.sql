
-- Enable RLS on pick_waves
ALTER TABLE pick_waves ENABLE ROW LEVEL SECURITY;

-- Drop existing policy if any (to avoid conflict)
DROP POLICY IF EXISTS "Enable read access for all users" ON pick_waves;
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON pick_waves;
DROP POLICY IF EXISTS "Enable update for authenticated users" ON pick_waves;

-- Create Permissive Policies for now (Authenticated Users)
-- READ
CREATE POLICY "Enable read access for all users" 
ON pick_waves FOR SELECT 
TO authenticated 
USING (true);

-- INSERT
CREATE POLICY "Enable insert for authenticated users" 
ON pick_waves FOR INSERT 
TO authenticated 
WITH CHECK (true);

-- UPDATE
CREATE POLICY "Enable update for authenticated users" 
ON pick_waves FOR UPDATE 
TO authenticated 
USING (true)
WITH CHECK (true);
