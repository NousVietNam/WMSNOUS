const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
    const boxCode = 'OUT-200126-002';
    console.log(`Processing SHIP ALL for box ${boxCode}...`);

    // 1. Get Box ID
    const { data: box, error } = await supabase
        .from('boxes')
        .select('id')
        .eq('code', boxCode)
        .single();

    if (error || !box) {
        console.error("Box not found:", error);
        return;
    }

    const boxId = box.id;

    // 2. Generate Transactions & Delete Inventory
    // We use a raw SQL block for atomicity if possible, or just sequential calls.
    // Client-side execution:

    // A. Get Items
    const { data: items } = await supabase
        .from('inventory_items')
        .select('*, products(sku)')
        .eq('box_id', boxId);

    if (!items || items.length === 0) {
        console.log("Box is empty already!");
    } else {
        console.log(`Found ${items.length} items. Creating transactions...`);
        const txs = items.map(i => ({
            type: 'MISCELLANEOUS_ISSUE',
            entity_type: 'ITEM',
            sku: i.products.sku,
            quantity: -i.quantity, // Negative for issue
            from_box_id: boxId,
            note: 'Xuất thủ công toàn bộ thùng ' + boxCode,
            created_at: new Date()
        }));

        const { error: txError } = await supabase.from('transactions').insert(txs);
        if (txError) {
            console.error("Tx Error:", txError);
            return;
        }

        console.log("Deleting inventory...");
        const { error: delError } = await supabase.from('inventory_items').delete().eq('box_id', boxId);
        if (delError) console.error("Delete Error:", delError);
    }

    // 3. Update Box Status
    console.log("Updating Box Status to SHIPPED and clearing location...");
    const { error: boxError } = await supabase
        .from('boxes')
        .update({ status: 'SHIPPED', location_id: null, updated_at: new Date() })
        .eq('id', boxId);

    if (boxError) {
        console.error("Box Update Error:", boxError);
    } else {
        console.log("SUCCESS! Box is now SHIPPED and empty.");
    }
}

run();
