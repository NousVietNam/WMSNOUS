const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function backfillBoxCounts() {
    console.log('Starting backfill for box_count...');

    // 1. Get all shipments
    const { data: shipments, error: fetchError } = await supabase
        .from('outbound_shipments')
        .select('id, outbound_order_id, code')
        .eq('box_count', 0); // Or check for 0 if default is 0 and you want to re-calculate

    if (fetchError) {
        console.error('Error fetching shipments:', fetchError);
        return;
    }

    console.log(`Found ${shipments.length} shipments to update.`);

    for (const shipment of shipments) {
        const orderId = shipment.outbound_order_id;
        let boxCount = 0;
        const uniqueBoxes = new Set();

        // A. Count from Boxes table (Direct)
        const { data: boxes } = await supabase
            .from('boxes')
            .select('id')
            .eq('outbound_order_id', orderId);

        boxes?.forEach(b => uniqueBoxes.add(b.id));

        // B. Count from Picking Jobs (History)
        const { data: jobs } = await supabase
            .from('picking_jobs')
            .select('picking_tasks(box_id)')
            .eq('outbound_order_id', orderId);

        jobs?.forEach(job => {
            job.picking_tasks?.forEach(task => {
                if (task.box_id) uniqueBoxes.add(task.box_id);
            });
        });

        boxCount = uniqueBoxes.size;
        console.log(`Shipment ${shipment.code}: Found ${boxCount} boxes.`);

        // Update Shipment
        const { error: updateError } = await supabase
            .from('outbound_shipments')
            .update({ box_count: boxCount })
            .eq('id', shipment.id);

        if (updateError) {
            console.error(`Failed to update shipment ${shipment.id}:`, updateError);
        }
    }

    console.log('Backfill completed!');
}

backfillBoxCounts();
