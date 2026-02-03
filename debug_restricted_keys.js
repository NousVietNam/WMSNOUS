
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function debug() {
    const { data } = await supabase.from('restricted_inventory').select('*').limit(1);
    if (data && data.length > 0) {
        console.log("Keys:", Object.keys(data[0]));
    } else {
        console.log("Empty or null");
    }
}

debug();
