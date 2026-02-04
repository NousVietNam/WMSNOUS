
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing Supabase credentials in .env.local');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkSku() {
    const SKU = 'A26NB1-OP2-U01-SW-NB';
    console.log(`Checking inventory for SKU: ${SKU}`);

    const { data, error } = await supabase
        .from('inventory_items')
        .select(`
      id,
      quantity,
      allocated_quantity,
      product:products!inner(sku, name),
      box:boxes!inner(id, code, status, inventory_type, type)
    `)
        .eq('product.sku', SKU)
        .gt('quantity', 0);

    if (error) {
        console.error('Error fetching inventory:', error);
        return;
    }

    console.log(`Found ${data.length} records.`);
    if (data.length > 0) {
        console.table(data.map(i => ({
            sku: i.product.sku,
            qty: i.quantity,
            allocated: i.allocated_quantity,
            box_code: i.box.code,
            box_status: i.box.status,
            box_inv_type: i.box.inventory_type, // Critical check
            box_type: i.box.type
        })));
    } else {
        console.log('No inventory found for this SKU.');
    }
    // Check bulk_inventory table
    console.log('--- Checking bulk_inventory table ---');
    const { data: bulkData, error: bulkError } = await supabase
        .from('bulk_inventory')
        .select(`
        id,
        quantity,
        allocated_quantity,
        product:products!inner(sku, name),
        box_id
    `)
        .eq('product.sku', SKU);

    if (bulkError) {
        console.error('Error fetching bulk_inventory:', bulkError);
    } else {
        console.log(`Found ${bulkData.length} records in bulk_inventory.`);
        if (bulkData.length > 0) {
            console.log(JSON.stringify(bulkData, null, 2));
        }
    }
}

checkSku();
