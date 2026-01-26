const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
    console.log("Fetching source code for ship_manual_job...");

    // Assuming we have an exec_sql RPC or similar. 
    // If not, we might need to rely on the user confirming.
    // But let's try a standard query if we can access pg_proc.

    // Note: Standard Supabase client can't query system catalogs directly unless exposed.
    // Let's TRY to use a known RPC 'exec_sql' if available, or just fail safely.

    const { data, error } = await supabase.rpc('exec_sql', {
        sql_query: "SELECT prosrc FROM pg_proc WHERE proname = 'ship_manual_job'"
    });

    if (error) {
        console.error("RPC exec_sql failed (maybe not relevant):", error.message);
        // Fallback: Just try to read the file content I wrote locally, assuming user ran it?
        // No, I need to know DB state.

        // Let's try listing recent migrations applied? No table for that in this project usually.
        return;
    }

    if (data && data.length > 0) {
        const source = data[0].prosrc;
        console.log("Source Code Preview:");
        if (source.includes("t.outbox_id IS NULL AND b.id = t.box_id")) {
            console.log(">>> SUCCESS: FOUND new logic 'Box Pick detection' in the database!");
        } else {
            console.log(">>> FAILURE: OLD logic detected. The migration was NOT applied.");
        }
        console.log(source.substring(0, 500) + "...");
    } else {
        console.log("Function not found or empty response.");
    }
}

run();
