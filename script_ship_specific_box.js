const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
    const targetBoxCode = 'BOX-0126-0003';
    console.log(`Processing update for ${targetBoxCode}...`);

    // 1. Update specific box
    const { data, error } = await supabase
        .from('boxes')
        .update({ status: 'SHIPPED', location_id: null, updated_at: new Date() })
        .eq('code', targetBoxCode)
        .select();

    if (error) {
        console.error(`Error updating ${targetBoxCode}:`, error);
    } else {
        console.log(`SUCCESS: Updated ${targetBoxCode} to SHIPPED (Location Cleared).`);
    }

    console.log("Running system-wide cleanup for SHIPPED boxes...");

    // 2. Bulk cleanup any other stuck boxes
    const { data: cleaned, error: cleanError } = await supabase
        .from('boxes')
        .update({ location_id: null, updated_at: new Date() })
        .eq('status', 'SHIPPED')
        .not('location_id', 'is', null) // Only update those that have a location
        .select();

    if (cleanError) {
        console.error("Cleanup Error:", cleanError);
    } else if (cleaned && cleaned.length > 0) {
        console.log(`CLEANUP: Fixed ${cleaned.length} other stuck boxes.`);
        cleaned.forEach(b => console.log(` - Fixed ${b.code}`));
    } else {
        console.log("CLEANUP: No other stuck boxes found.");
    }
}

run();
