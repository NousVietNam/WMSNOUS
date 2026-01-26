const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
    // 1. Create dummy order
    const { data: order, error } = await supabase.from('outbound_orders').insert({
        code: 'TEST-SHIP-' + Date.now(),
        status: 'PENDING',
        type: 'SALE',
        total: 0
    }).select().single();

    if (error) return console.error("Create Order Error:", error);
    console.log("Created Order:", order.id);

    // Update to PACKED
    console.log("Updating to PACKED...");
    const { error: updateError } = await supabase.from('outbound_orders').update({ status: 'PACKED' }).eq('id', order.id);
    if (updateError) console.error("Update Error:", updateError);

    // 2. Try to ship it
    console.log("Calling ship_outbound_order...");
    const { data: res, error: rpcError } = await supabase.rpc('ship_outbound_order', { p_order_id: order.id });

    if (rpcError) {
        console.error("RPC Error:", rpcError);
    } else {
        console.log("RPC Result:", res);
    }

    // 3. Cleanup
    await supabase.from('outbound_orders').delete().eq('id', order.id);
}

run();
