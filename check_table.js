
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function run() {
    const { data, error } = await s.rpc('exec_sql', { sql_query: "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'picking_tasks';" });
    console.log("Table check:", data);
}
run();
