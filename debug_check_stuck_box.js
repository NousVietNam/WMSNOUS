const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
    console.log("Checking last 5 SHIPPED orders...");

    const { data: orders, error } = await supabase
        .from('outbound_orders')
        .select(`
            id, code, status, type, shipped_at,
            boxes (id, code, status, location_id, outbound_order_id),
            outbound_shipments (id, code, created_at)
        `)
        .eq('status', 'SHIPPED')
        .order('shipped_at', { ascending: false })
        .limit(5);

    if (error) {
        console.error("Error fetching orders:", error);
        return;
    }

    for (const order of orders) {
        console.log(`\nOrder: ${order.code} (${order.id})`);
        console.log(`- Shipped At: ${order.shipped_at}`);

        if (order.boxes && order.boxes.length > 0) {
            console.log(`- Linked Boxes (${order.boxes.length}):`);
            order.boxes.forEach(b => {
                console.log(`  Box ${b.code}: Status=${b.status}, Location=${b.location_id}, OrderID=${b.outbound_order_id}`);
            });
        } else {
            console.log("- NO BOXES linked to this order via outbound_order_id!");
        }
    }

    console.log("\nChecking for boxes in GATE-OUT that should be shipped...");
    // Find boxes in GATE-OUT that are SHIPPED or associated with a SHIPPED order
    const { data: stuckBoxes } = await supabase
        .from('boxes')
        .select('id, code, status, location_id, outbound_order_id, outbound_orders(status)')
        .eq('status', 'SHIPPED')
        .not('location_id', 'is', null);

    if (stuckBoxes && stuckBoxes.length > 0) {
        console.log("\nXXX FOUND STUCK BOXES (Status=SHIPPED but Location!=NULL): XXX");
        stuckBoxes.forEach(b => {
            console.log(`  Box ${b.code}: Loc=${b.location_id}, OrderStatus=${b.outbound_orders?.status}`);
        });
    } else {
        console.log("\nNo stuck boxes found with Status=SHIPPED.");
    }
}

run();
