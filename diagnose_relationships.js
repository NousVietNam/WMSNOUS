
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function diagnose() {
    console.log('--- Diagnosing picking_jobs relationships ---');

    // Check if 'users' table exists
    const { data: users, error: usersError } = await supabase
        .from('users')
        .select('id')
        .limit(1);

    if (usersError) {
        console.error("Error accessing 'users' table:", usersError.message);
        // It might be 'profiles' or something else
        const { data: profiles, error: profilesError } = await supabase.from('profiles').select('id').limit(1);
        if (!profilesError) console.log("'profiles' table exists instead.");
    } else {
        console.log("'users' table exists.");
    }

    // Check columns of picking_jobs
    const { data: jobs, error: jobsError } = await supabase
        .from('picking_jobs')
        .select('*')
        .limit(1);

    if (jobs && jobs.length > 0) {
        const keys = Object.keys(jobs[0]);
        console.log('picking_jobs columns:', keys);
        console.log('Has user_id?', keys.includes('user_id'));
        console.log('Has assigned_to?', keys.includes('assigned_to'));
    }

    // We can't easily check internal constraints via JS client without an RPC that exposes information_schema.
    // However, we can try to "Create" a relationship query and see if it fails, or infer from previous success.

    // Instead, I will propose a SQL migration that ensures BOTH keys exist.
    // But first running this script to check columns is useful.
}

diagnose();
