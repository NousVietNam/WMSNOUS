
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
    console.log("Reading schema dump...");
    const { data, error } = await supabase.from('debug_schema_dump').select('*');

    if (error) {
        console.error("Error reading debug table:", error);
    } else {
        console.log("Schema Info:");
        data.forEach(row => console.log(row.info));
    }
}

run();
