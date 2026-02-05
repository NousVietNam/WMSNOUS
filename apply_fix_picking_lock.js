const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function runFix() {
    const sqlPath = 'database/migrations/fix_picking_lock_error.sql';
    const sql = fs.readFileSync(sqlPath, 'utf8');

    console.log(`🚀 Applying: ${sqlPath}...`);
    const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql });

    if (error) {
        console.error("❌ Error applying fix:", error.message);
    } else {
        console.log("✅ Fix applied successfully!");
    }
}

runFix();
