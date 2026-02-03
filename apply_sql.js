
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

        // Use the exec_sql RPC we know exists from previous searches
        const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql });

        if (error) {
            console.error(`❌ Error applying ${filePath}:`, error.message);
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
    // List of migrations to catch up on
    const migrations = [
        'database/migrations/migration_cancel_released_wave.sql',
        'database/migrations/migration_enhance_ship_safety.sql',
        'database/migrations/migration_smart_order_status_update.sql'
    ];

    for (const file of migrations) {
        await applySql(file);
    }
}

run();
