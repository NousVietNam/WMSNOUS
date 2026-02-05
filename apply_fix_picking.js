const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function runFix() {
    const sql = fs.readFileSync('database/migrations/migration_FIX_RELATION_ERROR_AND_BULK_PICK.sql', 'utf8');

    console.log("🚀 Applying Picking RPC Fix...");
    const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql });

    if (error) {
        console.error("❌ Error applying fix:", error.message);
    } else {
        console.log("✅ Picking RPC Fix applied successfully!");
    }
}

runFix();
