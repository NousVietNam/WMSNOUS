
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
    const sqlPath = args[0];
    if (!sqlPath || !fs.existsSync(sqlPath)) {
        console.error(`File not found: ${sqlPath}`);
        return;
    }
    const sqlContent = fs.readFileSync(sqlPath, 'utf8');

    console.log("Executing SQL Check (READ)...");
    const { data, error } = await supabase.rpc('exec_sql_read', { sql_query: sqlContent });

    if (error) {
        console.error("RPC Error:", error.message);
    } else {
        console.log("Success Result:", JSON.stringify(data, null, 2));
    }
}

run();
