
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
    console.log("1. Checking 'orders' vs 'outbound_orders' table...");
    const { error: errOrders } = await supabase.from('orders').select('id').limit(1);
    if (errOrders) console.log("'orders' table check failed (Expected):", errOrders.message);
    else console.log("'orders' table exists.");

    const { error: errOutbound } = await supabase.from('outbound_orders').select('id').limit(1);
    if (errOutbound) console.log("'outbound_orders' table check failed:", errOutbound.message);
    else console.log("'outbound_orders' table exists.");

    console.log("\n2. Testing 'get_dashboard_stats' RPC...");
    const { data, error } = await supabase.rpc('get_dashboard_stats');
    if (error) {
        console.error("RPC failed:", error.message);
        console.error("Details:", error.details);
    } else {
        console.log("RPC success. Data keys:", Object.keys(data));
        console.log("Data sample:", JSON.stringify(data, null, 2));
    }
}

check();
