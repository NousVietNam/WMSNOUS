const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
    const jobId = '85c13cc1-2f84-42e4-b9f0-ad25a312eb5d';
    const targetOutboxCode = 'OUT-200126-002';

    // 1. Get Target Outbox ID
    const { data: outbox } = await supabase.from('boxes').select('id').eq('code', targetOutboxCode).single();
    if (!outbox) return console.error("Outbox not found");
    const outboxId = outbox.id;

    console.log(`Repairing Job ${jobId} -> Outbox ${targetOutboxCode} (${outboxId})`);

    // 2. Get Completed Tasks
    // Note: User said job closed, but DB said PLANNED. 
    // Tasks might be COMPLETED or PENDING.
    // If PENDING, we should complete them. If COMPLETED, we check inventory.
    // Let's just process ALL tasks for this box in this job.

    const { data: tasks } = await supabase
        .from('picking_tasks')
        .select('*')
        .eq('job_id', jobId)
    // .eq('status', 'COMPLETED') // Just check all, or prioritize completed ones?
    // User said "job closed", implies they think it's done. 
    // Let's safe-guard: Check ALL tasks for this job/box.

    if (!tasks || tasks.length === 0) return console.log("No tasks found");

    for (const task of tasks) {
        console.log(`Processing Task ${task.id} (${task.products?.sku || task.product_id}) - Status: ${task.status}`);

        // A. Check Source Inventory
        const { data: sourceInv } = await supabase
            .from('inventory_items')
            .select('*')
            .eq('box_id', task.box_id)
            .eq('product_id', task.product_id)
            .single();

        if (!sourceInv || sourceInv.quantity < task.quantity) {
            console.warn(`  [SKIP] Source inventory missing or insufficient. (Have: ${sourceInv?.quantity}, Need: ${task.quantity})`);
            continue; // Can't move what we don't have
        }

        // B. Move Inventory
        console.log(`  [FIX] Moving ${task.quantity} items from ${task.box_id} to ${outboxId}`);

        // Deduct Source
        await supabase.from('inventory_items')
            .update({
                quantity: sourceInv.quantity - task.quantity,
                allocated_quantity: Math.max(0, (sourceInv.allocated_quantity || 0) - task.quantity)
            })
            .eq('id', sourceInv.id);

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

        // C. Ensure Task is Completed
        if (task.status !== 'COMPLETED') {
            await supabase.from('picking_tasks')
                .update({
                    status: 'COMPLETED',
                    outbox_id: outboxId,
                    outbox_code: targetOutboxCode,
                    picked_at: new Date()
                })
                .eq('id', task.id);
        }

        // D. Create Transaction Log (Optional but good for history)
        await supabase.from('transactions').insert({
            type: 'MOVE',
            entity_type: 'ITEM',
            quantity: task.quantity,
            from_box_id: task.box_id,
            to_box_id: outboxId,
            note: 'Repair Script: manual move',
            created_at: new Date()
        });
    }

    console.log("Repair Complete");
}

run();
