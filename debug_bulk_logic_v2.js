
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function debug() {
    console.log("--- DEBUGGING ORDER ITEMS ---");
    const orderCode = 'SO-0226-00002';

    // 1. Get Order ID
    const { data: order } = await supabase
        .from('outbound_orders')
        .select('*')
        .eq('code', orderCode)
        .single();

    if (!order) {
        console.error("Order not found!");
        return;
    }
    console.log(`Order Found: ${order.id} (${order.code}), Inventory Type: ${order.inventory_type}`);

    // 2. Get Attributes
    const { data: items } = await supabase
        .from('outbound_order_items')
        .select(`
            id, 
            quantity, 
            product_id, 
            products (id, sku, name)
        `)
        .eq('order_id', order.id);

    console.log(`Found ${items.length} items in order.`);

    for (const item of items) {
        const prod = item.products;
        console.log(`\nItem: ${prod.name} (SKU: ${prod.sku}) - Ordered: ${item.quantity}`);

        // Check Bulk Inventory for this Product
        const { data: bulkInv } = await supabase
            .from('bulk_inventory')
            .select('*')
            .eq('product_id', prod.id);

        if (!bulkInv || bulkInv.length === 0) {
            console.log("  -> NO BULK INVENTORY RECORDS FOUND.");
        } else {
            const total = bulkInv.reduce((s, i) => s + i.quantity, 0);
            const allocated = bulkInv.reduce((s, i) => s + (i.allocated_quantity || 0), 0);
            console.log(`  -> Bulk Stocks: Total=${total}, Allocated=${allocated}, Available=${total - allocated}`);
            console.log("  -> Details:", JSON.stringify(bulkInv.map(i => ({ id: i.id, qty: i.quantity })), null, 0));
        }

        // Check View
        const { data: view } = await supabase
            .from('view_product_availability_bulk')
            .select('*')
            .eq('product_id', prod.id)
            .single();

        console.log("  -> View availability:", view ? view.available_quantity : "Not found in view");
    }
}

debug();
