
const { createClient } = require('@supabase/supabase-js');

// Read from .env.local logic (hardcoded for script)
const supabaseUrl = 'https://syjqmspmlctadbaeqyxb.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN5anFtc3BtbGN0YWRiYWVxeXhiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzQxODg3MiwiZXhwIjoyMDgyOTk0ODcyfQ.7h_n_2i60bm2hBtsDzHQ46mnmv2-wlKL9D9aLwL_-NQ';

const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
});

async function run() {
    console.log("Attempting to insert RESERVE transaction with SKU...");

    // 1. Get a valid SKU
    const { data: product } = await supabase.from('products').select('sku').limit(1).single();
    if (!product) {
        console.error("No products found to test with.");
        return;
    }
    console.log("Found product SKU:", product.sku);

    // 2. Prepare Payload using SKU and Reference Columns
    const payload = {
        type: 'RESERVE',  // <--- Testing this specifically
        sku: product.sku,
        quantity: 1,
        location_id: null,
        reference_id: null,
        reference_code: 'TEST-DEBUG',
        note: 'Debug Script Test',
        created_at: new Date().toISOString()
    };

    console.log("Payload:", payload);

    const { data, error } = await supabase.from('transactions').insert([payload]).select();

    if (error) {
        console.error("Insert Error:", JSON.stringify(error, null, 2));
    } else {
        console.log("Insert Success! Row ID:", data[0].id);

        // Cleanup
        // await supabase.from('transactions').delete().eq('id', data[0].id);
    }
}

run();
