const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
    const boxCode = 'BOX-0126-0011';
    console.log(`Attempting to force clear location for ${boxCode}...`);

    const { data, error } = await supabase
        .from('boxes')
        .update({ location_id: null })
        .eq('code', boxCode)
        .select();

    if (error) {
        console.error("UPDATE ERROR:", error);
    } else {
        console.log("UPDATE SUCCESS:", data);
    }
}

run();
