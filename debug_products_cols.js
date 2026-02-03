
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function debug() {
    const { data: cols } = await supabase.rpc('exec_sql', {
        sql_query: "SELECT column_name FROM information_schema.columns WHERE table_name = 'products';"
    });
    console.log("Columns:", cols.map(c => c.column_name).join(', '));
}

debug();
