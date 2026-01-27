
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
    console.log("Reading debug view...");
    const { data, error } = await supabase
        .from('debug_views_exposed')
        .select('*')
        .eq('table_name', 'view_product_availability')
        .single();

    if (error) {
        console.error("Error:", error);
    } else {
        console.log("--- VIEW DEFINITION ---");
        console.log(data ? data.view_definition : "NOT FOUND");
        console.log("--- END ---");
    }
}

run();
