
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function debug() {
    const term = 'S26NB2';
    console.log(`Searching for term: ${term}`);

    const { data: products } = await supabase
        .from('products')
        .select('*')
        .ilike('sku', `%${term}%`);

    console.log(`Found ${products.length} products matching ${term}`);
    products.forEach(p => console.log(`- SKU: "${p.sku}" ID: ${p.id}`));

    const targetSku = 'S26NB2-A01-F01-SN-M';
    const product = products.find(p => p.sku === targetSku);

    if (!product) {
        console.log("EXACT MATCH NOT FOUND for", targetSku);
        return;
    }

    console.log(`\nAnalyzing Target Product: ${product.sku} (${product.id})`);

    // 2. Check Standard Inventory
    const { data: standardInv } = await supabase
        .from('inventory_items')
        .select('*')
        .eq('product_id', product.id);

    if (standardInv) {
        const standardTotal = standardInv.reduce((sum, i) => sum + i.quantity, 0);
        const standardAlloc = standardInv.reduce((sum, i) => sum + (i.allocated_quantity || 0), 0);
        console.log(`Standard Inventory (PIECE): Total=${standardTotal}, HardAlloc=${standardAlloc}`);
    }


    // 3. Check Bulk Inventory
    const { data: bulkInv, error: bError } = await supabase
        .from('bulk_inventory')
        .select('*')
        .eq('product_id', product.id);

    if (bError) {
        console.error("Error checking bulk_inventory:", bError);
    } else {
        const bulkTotal = bulkInv.reduce((sum, i) => sum + i.quantity, 0);
        const bulkAlloc = bulkInv.reduce((sum, i) => sum + (i.allocated_quantity || 0), 0);
        console.log(`Bulk Inventory: Total=${bulkTotal}, HardAlloc=${bulkAlloc}`);
        console.log("Bulk Items Raw:", JSON.stringify(bulkInv, null, 2));
    }

    // Order check
    const orderCode = 'SO-0226-00002';
    const { data: order } = await supabase
        .from('outbound_orders')
        .select('*')
        .eq('code', orderCode)
        .single();
    if (order) {
        console.log(`Order ${orderCode}: inventory_type=${order.inventory_type}`);
    }
}

debug();
