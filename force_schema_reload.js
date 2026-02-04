
const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function forceReloadSchema() {
    console.log("Forcing schema cache reload...")
    // Method 1: NOTIFY
    const { error: err1 } = await supabase.rpc('exec_sql', {
        sql_query: "NOTIFY pgrst, 'reload schema';"
    })

    if (err1) {
        console.error("Method 1 (NOTIFY) failed:", err1.message)
    } else {
        console.log("Method 1 (NOTIFY) sent.")
    }

    // Method 2: ALTER constraint directly to force a refresh if the notify is missed
    // Sometimes flipping a comment or doing a harmless alter helps
    // We will re-run the FK check just to be absolutely sure they exist, which might trigger a schema update
    const sql = `
    DO $$
    BEGIN
        -- Re-assert comments to trigger change events
        COMMENT ON CONSTRAINT picking_jobs_user_id_fkey ON picking_jobs IS 'Links job to creator';
        COMMENT ON CONSTRAINT picking_jobs_assigned_to_fkey ON picking_jobs IS 'Links job to assignee';
    END $$;
    `
    const { error: err2 } = await supabase.rpc('exec_sql', { sql_query: sql })

    if (err2) {
        console.error("Method 2 (Comment Update) failed:", err2.message)
    } else {
        console.log("Method 2 (Comment Update) applied to force refresh.")
    }
}

forceReloadSchema().catch(console.error)
