
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function debug() {
    console.log("Testing exec_sql with a test table...");
    const { data, error } = await supabase.rpc('exec_sql', {
        sql_query: "CREATE TABLE IF NOT EXISTS ___debug_test (id serial primary key, name text);"
    });

    if (error) {
        console.error("Error creating table:", error);
    } else {
        console.log("Create table command sent. checking if it exists...");
        const { data: cols, error: err2 } = await supabase.rpc('exec_sql', {
            sql_query: "SELECT column_name FROM information_schema.columns WHERE table_name = '___debug_test';"
        });
        console.log("Col check data:", cols);
        console.log("Col check error:", err2);
    }
}

debug();
