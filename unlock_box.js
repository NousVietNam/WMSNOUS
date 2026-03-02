const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
    const boxCode = process.argv[2];
    if (!boxCode) {
        console.log("Provide box code. Usage: node unlock_box.js INB-XXXX");
        return;
    }

    console.log(`Force Unlocking Box: ${boxCode}...`);

    // 1. Get box
    const { data: box } = await supabase.from('boxes').select('id, inventory_type').eq('code', boxCode).single();
    if (!box) {
        console.log("Box not found!");
        return;
    }

    // 2. Set box status to OPEN
    await supabase.from('boxes').update({ status: 'OPEN', outbound_order_id: null }).eq('id', box.id);
    console.log("Updated boxes table.");

    // 3. Reset allocated_quantity
    if (box.inventory_type === 'BULK') {
        await supabase.from('bulk_inventory').update({ allocated_quantity: 0 }).eq('box_id', box.id);
        console.log("Reset bulk_inventory allocated_quantity to 0.");
    } else {
        await supabase.from('inventory_items').update({ allocated_quantity: 0 }).eq('box_id', box.id);
        console.log("Reset inventory_items allocated_quantity to 0.");
    }

    // 4. Optionally, handle transactions/picking_tasks? We'll leave them alone so history is preserved, 
    // but the box is now free.

    console.log("Box is fully unlocked!");
}
run();
