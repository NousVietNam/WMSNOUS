
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkMobileQuery() {
    console.log("Testing Mobile Query...");

    // Exact query from mobile/picking/page.tsx
    const { data, error } = await supabase
        .from('picking_jobs')
        .select(`
            id,
            status,
            assigned_to,
            assignee:users!fk_picking_jobs_assignee (name)
        `)
        .in('status', ['OPEN', 'IN_PROGRESS', 'PENDING'])
        .order('created_at', { ascending: false });

    if (error) {
        console.error("Query Error:", error.message);
    } else {
        console.log(`Total Found: ${data.length}`);

        const unassigned = data.filter(j => !j.assigned_to);
        const assigned = data.filter(j => j.assigned_to);

        console.log(`Unassigned: ${unassigned.length}`);
        console.log(`Assigned: ${assigned.length}`);

        if (unassigned.length > 0) {
            console.log("Sample Unassigned:", JSON.stringify(unassigned[0], null, 2));
        }
        if (assigned.length > 0) {
            console.log("Sample Assigned:", JSON.stringify(assigned[0], null, 2));
        }
    }
}

checkMobileQuery();
