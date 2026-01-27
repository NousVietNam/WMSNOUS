
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function check() {
    console.log('Checking bulk_inventory schema...');
    const { data, error } = await supabase
        .from('bulk_inventory')
        .select('*')
        .limit(1);

    if (error) {
        console.error('Error:', error);
    } else if (data && data.length > 0) {
        console.log('Columns found:', Object.keys(data[0]));
    } else {
        console.log('No data in bulk_inventory, checking via error msg or assume columns.');
        // Try insert to fail and get columns? No, let's just trust migration files if empty.
    }
}

check();
