const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
    const boxCode = 'BOX-0126-0006';
    console.log(`RETRY: Clearing allocated quantity for ${boxCode}...`);

    const { data: box } = await supabase.from('boxes').select('id, status').eq('code', boxCode).single();
    if (!box) { console.error("Box not found"); return; }

    const { data: items, error: fetchError } = await supabase
        .from('inventory_items')
        .select('*')
        .eq('box_id', box.id);

    console.log(`Found ${items.length} items to update.`);

    // Update one by one to see which fails if any
    for (const item of items) {
        const { error } = await supabase
            .from('inventory_items')
            .update({ allocated_quantity: 0 })
            .eq('id', item.id);

        if (error) {
            console.error(`Failed to update item ${item.id}:`, JSON.stringify(error, null, 2));
        } else {
            console.log(`Updated item ${item.id}`);
        }
    }

    // Unlock box
    if (box.status === 'LOCKED') {
        console.log("Unlocking box...");
        const { error: boxError } = await supabase
            .from('boxes')
            .update({ status: 'OPEN', outbound_order_id: null })
            .eq('id', box.id);
        if (boxError) console.error("Box unlock error:", boxError);
    }
}

run();
