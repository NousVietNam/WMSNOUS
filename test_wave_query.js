
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function debug() {
    const { data, error } = await supabase
        .from('pick_waves')
        .select('*, picking_jobs(id, code), user:users!pick_waves_created_by_profiles_fkey(name)')
        .limit(1);

    if (error) {
        console.error("Query Error:", error);
    } else {
        console.log("Query Success!");
        if (data.length > 0) {
            console.log("Sample User:", data[0].user);
        } else {
            console.log("No waves found.");
        }
    }
}

debug();
