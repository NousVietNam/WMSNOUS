
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function viewDef() {
    const { data, error } = await supabase.rpc('exec_sql', {
        sql_query: "select pg_get_functiondef(oid) from pg_proc where proname = 'get_inventory_filter_options'"
    });

    if (error) console.error(error);
    else console.log(JSON.stringify(data, null, 2));
}

viewDef();
