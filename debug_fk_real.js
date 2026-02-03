
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function debug() {
    console.log("Checking FK again...");
    const { data: constraints, error } = await supabase.rpc('exec_sql', {
        sql_query: `
            SELECT
                conname AS constraint_name,
                contype AS constraint_type,
                pg_get_constraintdef(c.oid) AS definition
            FROM pg_constraint c
            JOIN pg_namespace n ON n.oid = c.connamespace
            WHERE n.nspname = 'public' AND conrelid = 'pick_waves'::regclass;
        `
    });

    if (error) {
        console.error("RPC Error:", error);
    } else {
        console.log("Constraints found:", JSON.stringify(constraints, null, 2));
    }
}

debug();
