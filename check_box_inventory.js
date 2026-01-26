const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
    const boxCode = 'OUT-200126-002';
    console.log(`Checking box ${boxCode}...`);

    const { data: box, error } = await supabase
        .from('boxes')
        .select(`
            id, code, type, status, location_id,
            inventory_items (id, product_id, quantity, products(sku, name))
        `)
        .eq('code', boxCode)
        .single();

    if (error) {
        console.error("Error:", error.message);
        return;
    }

    if (!box) {
        console.error("Box not found!");
        return;
    }

    console.log("Box Info:", {
        id: box.id,
        type: box.type,
        status: box.status,
        location: box.location_id
    });

    console.log("Inventory:", box.inventory_items.map(i => `${i.products.sku}: ${i.quantity}`));
}

run();
