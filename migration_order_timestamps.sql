-- Add Assignment and Timestamp tracking to Orders
ALTER TABLE "orders"
ADD COLUMN IF NOT EXISTS "assigned_staff_id" UUID REFERENCES "users"("id"),
ADD COLUMN IF NOT EXISTS "assigned_at" TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS "picking_at" TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS "completed_at" TIMESTAMPTZ;

-- Ensure RLS allows updating these columns (usually assumes generic update policy, but good to note)
