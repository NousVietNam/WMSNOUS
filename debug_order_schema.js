
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function debug() {
    console.log("Checking outbound_orders schema...");
    const { data: items, error } = await supabase
        .from('outbound_orders')
        .select('*')
        .limit(1);

    if (items && items.length > 0) {
        console.log("Keys:", Object.keys(items[0]));
        console.log("Sample inv_type:", items[0].inventory_type, typeof items[0].inventory_type);
    } else {
        console.log("Empty table or error:", error);
    }
}

debug();
