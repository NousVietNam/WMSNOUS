const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
    const taskId = '3242e70f-f089-4d98-bb1c-2a519ed87f89'; // Same task (already completed? No, check status)
    // Wait, previous run COMPLETED it. I need a new pending task.
    // I will pick another one from the list I logged earlier.
    const taskId2 = '5bea8f3d-dae1-4379-a0e3-2bab18d14906';
    const outboxId = 'cb9485c0-9b5c-47eb-823e-6e5cd53c7554';
    const userId = null;

    console.log(`Calling RPC confirm_picking_batch with NULL user...`);
    console.log(`Task: ${taskId2}`);

    const { data, error } = await supabase.rpc('confirm_picking_batch', {
        p_task_ids: [taskId2],
        p_outbox_id: outboxId,
        p_user_id: userId
    });

    if (error) {
        console.error('RPC Error:', error);
    } else {
        console.log('RPC Success:', data);
    }
}

run();
