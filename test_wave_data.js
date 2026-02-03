
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function debug() {
    const { data: waves } = await supabase.from('pick_waves').select('id, code, created_by').limit(5);
    console.log("Waves:", waves);

    // Check if user exists
    if (waves.length > 0 && waves[0].created_by) {
        const userId = waves[0].created_by;
        const { data: user } = await supabase.from('users').select('*').eq('id', userId);
        console.log(`User ${userId} found:`, user.length > 0);
    }
}

debug();
