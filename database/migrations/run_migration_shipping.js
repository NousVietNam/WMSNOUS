const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function runMigration() {
    const sql = `
-- Migration: Shipping Feature
-- 1. Update Orders Status Check
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check CHECK (status IN ('PENDING', 'ALLOCATED', 'PICKING', 'COMPLETED', 'SHIPPED', 'CANCELLED'));

-- 2. Update Transfer Orders Status Check
ALTER TABLE transfer_orders DROP CONSTRAINT IF EXISTS transfer_orders_status_check;
ALTER TABLE transfer_orders ADD CONSTRAINT transfer_orders_status_check CHECK (status IN ('pending', 'approved', 'allocated', 'picking', 'completed', 'shipped', 'cancelled'));

-- 3. Add shipped_at columns
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipped_at TIMESTAMPTZ;
ALTER TABLE transfer_orders ADD COLUMN IF NOT EXISTS shipped_at TIMESTAMPTZ;

-- 4. Reload Postgrest
NOTIFY pgrst, 'reload config';
    `;

    console.log("Running SQL migration...")
    // Try both sql_query and sql as parameter names
    let result = await supabase.rpc('exec_sql', { sql_query: sql })
    if (result.error) {
        console.log("Failed with sql_query, trying sql...")
        result = await supabase.rpc('exec_sql', { sql: sql })
    }

    if (result.error) {
        console.error("Migration failed:", result.error)
    } else {
        console.log("Migration successful!")
    }
}

runMigration()
