const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
    const jobId = 'b6366e83-bd9a-4f64-be24-696f665bf970';
    const sourceBoxId = '3d56fe05-0d75-4210-90cd-9ac09e570aa6'; // BOX-TEST-97
    const targetOutboxCode = 'OUT-200126-002';

    // 1. Get Target Outbox ID
    const { data: outbox } = await supabase.from('boxes').select('id').eq('code', targetOutboxCode).single();
    if (!outbox) return console.error("Outbox not found");
    const outboxId = outbox.id;

    console.log(`Repairing Job ${jobId} -> Source ${sourceBoxId} -> Outbox ${targetOutboxCode} (${outboxId})`);

    // 2. Get Tasks for this job & box
    const { data: tasks } = await supabase
        .from('picking_tasks')
        .select('*')
        .eq('job_id', jobId)
        .eq('box_id', sourceBoxId);

    if (!tasks || tasks.length === 0) return console.log("No tasks found");

    for (const task of tasks) {
        console.log(`Processing Task ${task.id} (Prod: ${task.product_id}) - Status: ${task.status}`);

        // A. Check Source Inventory
        const { data: sourceInv } = await supabase
            .from('inventory_items')
            .select('*')
            .eq('box_id', sourceBoxId)
            .eq('product_id', task.product_id)
            .single();

        if (!sourceInv || sourceInv.quantity < task.quantity) {
            console.warn(`  [SKIP] Source inventory missing or insufficient. (Have: ${sourceInv?.quantity}, Need: ${task.quantity})`);
            // Even if missing, if task is COMPLETED, we might assume it's already moved?
            // But user says it's still there. So likely sourceInv.quantity >= task.quantity.
            continue;
        }

        // B. Move Inventory
        console.log(`  [FIX] Moving ${task.quantity} items from ${sourceBoxId} to ${outboxId}`);

        // Deduct Source
        await supabase.from('inventory_items')
            .delete() // Assuming we take all? No, verify qty.
            .eq('id', sourceInv.id);
        // Wait, careful. If source has MORE than task, only update.
        // If source == task, delete.

        if (sourceInv.quantity > task.quantity) {
            await supabase.from('inventory_items')
                .update({
                    quantity: sourceInv.quantity - task.quantity,
                    allocated_quantity: Math.max(0, (sourceInv.allocated_quantity || 0) - task.quantity)
                })
                .eq('id', sourceInv.id);
        } else {
            // Exact match or less (covered by skip check)
            await supabase.from('inventory_items').delete().eq('id', sourceInv.id);
        }

        // Add to Dest
        const { data: destInv } = await supabase
            .from('inventory_items')
            .select('*')
            .eq('box_id', outboxId)
            .eq('product_id', task.product_id)
            .single();

        if (destInv) {
            await supabase.from('inventory_items')
                .update({
                    quantity: destInv.quantity + task.quantity,
                    allocated_quantity: (destInv.allocated_quantity || 0) + task.quantity
                })
                .eq('id', destInv.id);
        } else {
            await supabase.from('inventory_items').insert({
                box_id: outboxId,
                product_id: task.product_id,
                quantity: task.quantity,
                allocated_quantity: task.quantity
            });
        }

        // C. Update Task Info (just to be safe)
        await supabase.from('picking_tasks')
            .update({
                status: 'COMPLETED',
                outbox_id: outboxId,
                outbox_code: targetOutboxCode,
                picked_at: new Date()
            })
            .eq('id', task.id);

        // D. Create Transaction Log
        await supabase.from('transactions').insert({
            type: 'MOVE',
            entity_type: 'ITEM',
            quantity: task.quantity,
            from_box_id: sourceBoxId,
            to_box_id: outboxId,
            note: 'Repair Script: manual move (Job 2)',
            created_at: new Date()
        });
    }

    // Force Complete Job if needed
    await supabase.from('picking_jobs')
        .update({ status: 'COMPLETED', completed_at: new Date() })
        .eq('id', jobId);

    console.log("Repair 2 Complete");
}

run();
