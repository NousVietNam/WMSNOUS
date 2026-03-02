const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
    console.log("Investigating order INB-0126-1117 in transfer_orders");

    const { data: orders, error: orderErr } = await supabase
        .from('transfer_orders')
        .select('*')
        .eq('code', 'INB-0126-1117');

    if (orderErr) {
        console.error("Error order:", orderErr);
    } else {
        console.log("Order(s):", JSON.stringify(orders, null, 2));
    }
}
run();
