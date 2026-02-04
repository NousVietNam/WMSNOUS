
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkSchema() {
    console.log('--- Checking picking_jobs columns ---');
    const { data: jobs, error: err1 } = await supabase
        .from('picking_jobs')
        .select('*')
        .limit(1);

    if (jobs && jobs.length > 0) {
        console.log('picking_jobs keys:', Object.keys(jobs[0]));
    } else {
        console.log('picking_jobs empty or error:', err1);
    }

    console.log('\n--- Checking outbound_orders columns ---');
    const { data: orders, error: err2 } = await supabase
        .from('outbound_orders')
        .select('*')
        .limit(1);

    if (orders && orders.length > 0) {
        console.log('outbound_orders keys:', Object.keys(orders[0]));
    } else {
        console.log('outbound_orders empty or error:', err2);
    }
}

checkSchema();
