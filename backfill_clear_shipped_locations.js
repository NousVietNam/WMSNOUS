const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function clearShippedLocations() {
    console.log('Finding SHIPPED boxes with a location...');

    // 1. Find SHIPPED boxes that still have a location_id
    const { data: boxes, error: fetchError } = await supabase
        .from('boxes')
        .select('id, code, location_id')
        .eq('status', 'SHIPPED')
        .not('location_id', 'is', null);

    if (fetchError) {
        console.error('Error fetching boxes:', fetchError);
        return;
    }

    if (!boxes || boxes.length === 0) {
        console.log('No SHIPPED boxes found with a location. Data is clean!');
        return;
    }

    console.log(`Found ${boxes.length} SHIPPED boxes still in a location.`);

    // 2. Update them
    const boxIds = boxes.map(b => b.id);
    const { error: updateError } = await supabase
        .from('boxes')
        .update({ location_id: null })
        .in('id', boxIds);

    if (updateError) {
        console.error('Error updating boxes:', updateError);
    } else {
        console.log(`Successfully cleared location for ${boxes.length} boxes.`);
    }
}

clearShippedLocations();
