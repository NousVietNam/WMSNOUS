
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkSchema() {
    const { data, error } = await supabase
        .from('outbound_order_items')
        .select('*')
        .limit(1);

    if (error) {
        console.error(error);
    } else if (data && data.length > 0) {
        console.log('Columns:', Object.keys(data[0]));
    } else {
        console.log('No data found, cannot infer columns. Trying RPC inspector or assuming standard.');
        const { data: cols } = await supabase.rpc('debug_get_columns', { table_name: 'outbound_order_items' });
        if (cols) console.log('RPC Columns:', cols);
    }
}

checkSchema();
