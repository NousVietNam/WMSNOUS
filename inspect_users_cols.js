
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function inspectUsers() {
    const { data, error } = await supabase.rpc('inspect_table_columns', { table_name: 'users' });

    if (error) {
        // Fallback if RPC doesn't exist
        const { data: cols, error: err2 } = await supabase.from('users').select('*').limit(1);
        if (cols && cols.length > 0) {
            console.log("Columns:", Object.keys(cols[0]));
        } else {
            console.error("Could not get columns:", err2 || "No data");
        }
    } else {
        console.log("Columns:", data);
    }
}

inspectUsers();
