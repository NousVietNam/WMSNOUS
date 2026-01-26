const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
    const boxCode = 'BOX-0126-0006';
    console.log(`Clearing allocated quantity for ${boxCode}...`);

    const { data: box } = await supabase.from('boxes').select('id').eq('code', boxCode).single();
    if (!box) { console.error("Box not found"); return; }

    const { data, error } = await supabase
        .from('inventory_items')
        .update({ allocated_quantity: 0, updated_at: new Date() })
        .eq('box_id', box.id)
        .select();

    if (error) {
        console.error("Update Error:", error);
    } else {
        console.log(`SUCCESS: Cleared allocation for ${data.length} items.`);

        // Unlock box if it was locked
        if (box.status === 'LOCKED') {
            console.log("Unlocking box...");
            await supabase.from('boxes').update({ status: 'OPEN', outbound_order_id: null }).eq('id', box.id);
        }
    }
}

run();
