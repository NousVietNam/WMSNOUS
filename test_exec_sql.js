const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
    const { data, error } = await supabase.rpc('exec_sql', { sql_query: 'SELECT 1 as result' });
    if (error) {
        console.error("RPC Error:", error.message);
        console.error("Full Error:", JSON.stringify(error, null, 2));
    } else {
        console.log("Success:", data);
    }
}
run();
