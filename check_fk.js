
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkFK() {
    const sql = `
    SELECT
        tc.constraint_name, 
        tc.table_name, 
        kcu.column_name, 
        ccu.table_name AS foreign_table_name,
        rc.delete_rule 
    FROM 
        information_schema.table_constraints AS tc 
        JOIN information_schema.key_column_usage AS kcu
          ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
        JOIN information_schema.constraint_column_usage AS ccu
          ON ccu.constraint_name = tc.constraint_name
          AND ccu.table_schema = tc.table_schema
        JOIN information_schema.referential_constraints AS rc
          ON rc.constraint_name = tc.constraint_name
    WHERE tc.table_name = 'picking_tasks' AND kcu.column_name = 'job_id';
    `;

    const { data, error } = await s.rpc('exec_sql', { sql_query: sql });
    if (error) {
        console.error("Error:", error);
    } else {
        console.log("FK Details:", JSON.stringify(data, null, 2));
    }
}

checkFK();
