
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function run() {
    const { data, error } = await s.rpc('exec_sql', { sql_query: "SELECT 1 as test" });
    console.log("Test result:", data);
    if (error) console.error("Error:", error);
}
run();
