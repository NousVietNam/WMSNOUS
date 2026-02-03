
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function debug() {
    console.log("Searching for products named 'Khẩu trang màu nâu M'...");
    const { data: products } = await supabase
        .from('products')
        .select('id, sku, name')
        .ilike('name', '%Khẩu trang màu nâu M%');

    if (!products.length) {
        console.log("No products found by name.");
    }

    for (const p of products) {
        console.log(`Product: ${p.name}`);
        console.log(`  ID: ${p.id}`);
        console.log(`  SKU: '${p.sku}'`);

        // Check availability for this ID
        const { data: view } = await supabase.from('view_product_availability_bulk').select('*').eq('product_id', p.id).single();
        console.log(`  Available Bulk: ${view ? view.available_quantity : 'N/A'}`);
    }
}

debug();
