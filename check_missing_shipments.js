const { createClient } = require('@supabase/supabase-js');

require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkMissingShipments() {
    console.log('Checking for SHIPPED orders without shipment records...');

    // 1. Get all SHIPPED orders
    const { data: orders, error: orderError } = await supabase
        .from('outbound_orders')
        .select('id, code, type, status, created_at')
        .eq('status', 'SHIPPED');

    if (orderError) {
        console.error('Error fetching orders:', orderError);
        return;
    }

    console.log(`Found ${orders.length} SHIPPED orders.`);

    // 2. Get all Shipments
    const { data: shipments, error: shipError } = await supabase
        .from('outbound_shipments')
        .select('outbound_order_id, code');

    if (shipError) {
        console.error('Error fetching shipments:', shipError);
        return;
    }

    console.log(`Found ${shipments.length} shipment records.`);

    // 3. Find Missing
    const shipmentOrderIds = new Set(shipments.map(s => s.outbound_order_id));
    const missing = orders.filter(o => !shipmentOrderIds.has(o.id));

    console.log(`\n=== MISSING SHIPMENTS: ${missing.length} ===`);
    if (missing.length > 0) {
        missing.forEach(o => {
            console.log(`- ${o.code} (${o.type}) - Created: ${o.created_at}`);
        });
    } else {
        console.log("Good news! All SHIPPED orders have a corresponding shipment record.");
    }
}

checkMissingShipments();
