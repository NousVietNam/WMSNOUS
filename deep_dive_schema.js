
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function deepDive() {
    console.log("Deep dive into schema...");

    // Check tables
    const { data: tables, error: tableError } = await supabase.rpc('exec_sql', {
        sql_query: "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('users', 'picking_jobs');"
    });
    console.log("Tables:", tables);

    // Check constraints exact names
    const sqlConstraints = `
        SELECT conname as constraint_name, 
               conrelid::regclass as table_name, 
               confrelid::regclass as foreign_table_name
        FROM pg_constraint 
        WHERE conrelid = 'picking_jobs'::regclass 
        AND confrelid = 'users'::regclass;
    `;

    const { data: cons, error: consError } = await supabase.rpc('exec_sql', { sql_query: sqlConstraints });
    console.log("Constraints from PG:", cons);
    if (consError) console.error(consError);

    // Attempt to force a massive schema change that usually triggers reload
    // We will drop the constraints if they exist and recreate them.
}

deepDive();
