
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkDump() {
    const { data, error } = await supabase
        .from('debug_schema_info')
        .select('*');

    if (error) {
        console.error(error);
    } else {
        console.log('--- DUMP CONTENT ---');
        data.forEach(r => console.log(r.content));
    }
}

checkDump();
