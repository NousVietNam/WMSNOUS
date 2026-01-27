const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
    console.log("Reading SQL file...");
    const args = process.argv.slice(2);
    const sqlPath = args[0] || 'database/migrations/migration_add_box_id_to_bulk_inventory.sql';
    if (!fs.existsSync(sqlPath)) {
        console.error(`File not found: ${sqlPath}`);
        return;
    }
    const sqlContent = fs.readFileSync(sqlPath, 'utf8');

    console.log("Executing SQL...");
    // Attempt standard 'exec_sql' RPC if enabled
    const { data, error } = await supabase.rpc('exec_sql', { sql_query: sqlContent });

    if (error) {
        console.error("RPC Error:", error.message);
        console.log("Attempting Split execution (splitting by semicolon)...");
        // Fallback: Split commands? No, complicated with stored procs ($$).
        // Better instruction to user.
    } else {
        console.log("Success:", data);
    }
}

run();
