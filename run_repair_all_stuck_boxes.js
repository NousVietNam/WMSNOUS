const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
    console.log("Searching for stuck boxes (SHIPPED but with Location)...");

    // 1. Find them
    const { data: boxes, error } = await supabase
        .from('boxes')
        .select('id, code, location_id')
        .eq('status', 'SHIPPED')
        .not('location_id', 'is', null);

    if (error) {
        console.error("Error searching:", error);
        return;
    }

    if (!boxes || boxes.length === 0) {
        console.log("No stuck boxes found! System is clean.");
        return;
    }

    console.log(`Found ${boxes.length} stuck boxes. Fixing...`);

    // 2. Fix them
    const { data: updated, error: updateError } = await supabase
        .from('boxes')
        .update({ location_id: null, updated_at: new Date() })
        .eq('status', 'SHIPPED')
        .not('location_id', 'is', null)
        .select();

    if (updateError) {
        console.error("Update failed:", updateError);
    } else {
        console.log(`Successfully cleared locations for ${updated.length} boxes.`);
        updated.forEach(b => console.log(` - Fixed ${b.code}`));
    }
}

run();
