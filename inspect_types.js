
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function inspect() {
    console.log("Inspecting column types via SQL...");

    // We check types from information_schema
    const sql = `
        SELECT table_name, column_name, data_type, udt_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name IN ('picking_jobs', 'users')
          AND column_name IN ('id', 'user_id', 'assigned_to');
    `;

    const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql });

    if (error) {
        console.error("Error inspecting:", error);
    } else {
        console.table(data);
    }
}

inspect();
