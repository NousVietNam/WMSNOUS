const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
    const jobId = '85c13cc1-2f84-42e4-b9f0-ad25a312eb5d';

    console.log(`Updating Job ${jobId} to COMPLETED...`);

    const { data, error } = await supabase.from('picking_jobs')
        .update({
            status: 'COMPLETED',
            started_at: new Date(), // approximate
            completed_at: new Date()
        })
        .eq('id', jobId)
        .select();

    if (error) {
        console.error('Error:', error);
    } else {
        console.log('Success:', data);
    }
}

run();
