
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('❌ Missing Supabase credentials in .env.local');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function applySql(filePath) {
    try {
        const sql = fs.readFileSync(filePath, 'utf8');
        console.log(`🚀 Applying ${path.basename(filePath)}...`);

        // Use pg_query_exec if exec_sql is not available, or try typical variations
        // Based on previous file, 'exec_sql' seems to be the one.
        const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql });

        if (error) {
            console.error(`❌ Error applying ${filePath}:`, error.message);

            // Fallback: try direct split if it's a multi-statement and RPC fails (though RPC exec_sql usually handles it)
            return false;
        } else {
            console.log(`✅ ${path.basename(filePath)} applied successfully!`);
            return true;
        }
    } catch (err) {
        console.error(`❌ Critical error:`, err.message);
        return false;
    }
}

async function run() {
    const file = process.argv[2];
    if (!file) {
        console.error("Please provide a SQL file path");
        process.exit(1);
    }
    await applySql(file);
}

run();
