const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
    const boxCode = 'BOX-0126-0006';
    console.log(`Checking inventory for ${boxCode}...`);

    const { data: box } = await supabase.from('boxes').select('id').eq('code', boxCode).single();
    if (!box) { console.error("Box not found"); return; }

    const { data: items } = await supabase
        .from('inventory_items')
        .select('id, product_id, quantity, allocated_quantity, products(sku)')
        .eq('box_id', box.id);

    console.log("Current Items:", items.map(i =>
        `${i.products.sku}: Qty=${i.quantity}, Alloc=${i.allocated_quantity}`
    ));
}

run();
