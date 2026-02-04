
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkConstraints() {
    console.log("Checking constraints on picking_jobs...");

    // We can query pg_constraint directly via RPC if we have one, or use information_schema via a wrapper.
    // Since I have exec_sql, I will use that.

    const sql = `
        SELECT con.conname, 
               kcu.column_name, 
               ccu.table_name AS foreign_table_name,
               ccu.column_name AS foreign_column_name 
        FROM information_schema.table_constraints tc 
        JOIN information_schema.key_column_usage kcu 
          ON tc.constraint_name = kcu.constraint_name 
          AND tc.table_schema = kcu.table_schema 
        JOIN information_schema.constraint_column_usage ccu 
          ON ccu.constraint_name = tc.constraint_name 
          AND ccu.table_schema = tc.table_schema 
        JOIN pg_constraint con ON con.conname = tc.constraint_name
        WHERE tc.table_name = 'picking_jobs' 
          AND tc.constraint_type = 'FOREIGN KEY';
    `;

    const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql });

    if (error) {
        console.error("Error fetching constraints:", error);
        // Fallback to previous investigation method if exec_sql fails returns non-json that client can't parse (unlikely for select)
    } else {
        console.log("Constraints found:", JSON.stringify(data, null, 2));
    }
}

checkConstraints();
