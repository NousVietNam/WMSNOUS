
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkConstraints() {
    const { data, error } = await supabase.rpc('get_table_constraints', { table_name: 'picking_jobs' });
    if (error) console.log('RPC Error:', error.message);
    else console.log(data);
}
// Fallback: Just add the FK if missing, it's safer.
console.log("Assuming FK missing or named differently. Will implement migration to add/ensure FK.");
