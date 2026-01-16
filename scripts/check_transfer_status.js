
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
    console.log("Inspecting Transfer Orders...");

    try {
        console.log("=== DEBUG START ===");
        const TRANSFER_ID = 'b7c855fa-0894-4924-aab1-9e73a9d21d78';

        // 1. Get Transfer Items
        const { data: items } = await supabase
            .from('transfer_order_items')
            .select('id, box_id, quantity')
            .eq('transfer_id', TRANSFER_ID);

        console.log("Transfer Items:", items?.length);

        if (items && items.length > 0 && items[0].box_id) {
            const boxId = items[0].box_id;
            console.log(`Checking Box ID: ${boxId}`);

            // 2. Check Inventory Items
            const { data: boxItems, error } = await supabase
                .from('inventory_items')
                .select('id, product_id, quantity')
                .eq('box_id', boxId);

            console.log("Box Items Count:", boxItems?.length);

            if (boxItems && boxItems.length > 0) {
                const item = boxItems[0];
                console.log("First Inv Item:", JSON.stringify(item));

                // Check Product
                if (item.product_id) {
                    const { data: prod, error: prodError } = await supabase
                        .from('products')
                        .select('id, sku, name')
                        .eq('id', item.product_id)
                        .single();

                    if (prodError) console.log("Product Error:", prodError);
                    console.log("Product Details:", JSON.stringify(prod));
                } else {
                    console.log("Inv Item has NO product_id");
                }
            }
            if (error) console.log("Box Error:", error);
            if (boxItems) console.log("Box Items:", JSON.stringify(boxItems));
        } else {
            console.log("No Box ID found in items.");
        }

        console.log("=== DEBUG END ===");
    } catch (e) {
        console.error("Script Error:", e);
    }
}


run();
