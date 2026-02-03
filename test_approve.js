
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function testApprove() {
    const orderCode = 'SO-0226-00002';
    const { data: order } = await supabase.from('outbound_orders').select('id, code, inventory_type').eq('code', orderCode).single();

    console.log(`Testing Approval for Order ${order.code} (ID: ${order.id})`);
    console.log(`Inventory Type: '${order.inventory_type}'`); // Quote to see spaces

    const { data: result, error } = await supabase.rpc('approve_outbound', { p_order_id: order.id });

    if (error) {
        console.error("RPC Error:", error);
    } else {
        console.log("RPC Result:", JSON.stringify(result, null, 2));

        if (result.success) {
            console.log("SUCCESS! Logic used Bulk view (since result was success and Piece avail is 0).");
            // Revert
            console.log("Reverting (Unapproving)...");
            await supabase.rpc('unapprove_outbound', { p_order_id: order.id });
            console.log("Reverted.");
        } else {
            console.log("FAILURE. Logic likely used Piece view.");
        }
    }
}

testApprove();
