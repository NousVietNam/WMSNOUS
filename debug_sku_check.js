
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function debug() {
    const skusToCheck = [
        'S26NB2-A01-F01-SN-M', // From Error Dialog
        'S26NB2-AO1-F01-SN-M', // Probable Correct SKU
    ];

    console.log("--- Checking Products ---");
    for (const sku of skusToCheck) {
        console.log(`\nChecking SKU: '${sku}'`);
        const { data: products } = await supabase.from('products').select('*').eq('sku', sku);

        if (!products || products.length === 0) {
            console.log("  -> Product NOT FOUND.");
            continue;
        }

        const product = products[0];
        console.log(`  -> Found Product ID: ${product.id}, Name: ${product.name}`);

        // Check Bulk Inventory
        const { data: bulkInv } = await supabase.from('bulk_inventory').select('*').eq('product_id', product.id);
        const total = bulkInv.reduce((s, i) => s + i.quantity, 0);
        console.log(`  -> Bulk Inventory Total: ${total}`);

        // Check View
        const { data: view } = await supabase.from('view_product_availability_bulk').select('*').eq('product_id', product.id).single();
        console.log(`  -> View Availability: ${view ? view.available_quantity : 'N/A'}`);
    }
}

debug();
