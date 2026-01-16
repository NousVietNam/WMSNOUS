
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://syjqmspmlctadbaeqyxb.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN5anFtc3BtbGN0YWRiYWVxeXhiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzQxODg3MiwiZXhwIjoyMDgyOTk0ODcyfQ.7h_n_2i60bm2hBtsDzHQ46mnmv2-wlKL9D9aLwL_-NQ';

const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
});

async function run() {
    const transferId = '499edcec-5cd4-42fe-87c6-4615b1b4c723';
    console.log(`Debugging Cancel Approve for: ${transferId}`);

    // 1. Fetch Order
    const { data: order, error: orderError } = await supabase
        .from('transfer_orders')
        .select('*')
        .eq('id', transferId)
        .single();

    if (orderError) { console.error("Order fetch error:", orderError); return; }
    console.log("Order Status:", order.status);

    // 2. Fetch Transactions
    const { data: reserveTxs, error: txError } = await supabase
        .from('transactions')
        .select('*')
        .eq('reference_id', transferId)
        .eq('type', 'RESERVE');

    if (txError) { console.error("Tx fetch error:", txError); return; }
    console.log(`Found ${reserveTxs.length} RESERVE transactions.`);

    if (reserveTxs.length > 0) {
        console.log("Sample Tx:", reserveTxs[0]);
    }
}

run();
