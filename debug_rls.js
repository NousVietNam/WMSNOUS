const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkPolicies() {
    console.log("Checking RLS policies for 'boxes' table...");
    const { data, error } = await supabase.rpc('run_sql_query', {
        query: "SELECT * FROM pg_policies WHERE tablename = 'boxes';"
    });

    if (error) {
        console.error("Error:", error);
    } else {
        console.table(data);
    }
}

checkPolicies();
