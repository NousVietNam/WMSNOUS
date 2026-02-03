
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function debug() {
    console.log("Dumping table columns and constraints...");
    const { data: cols } = await supabase.rpc('exec_sql', {
        sql_query: `
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'pick_waves';
        `
    });
    console.log("Columns:", cols);

    const { data: allConstraints } = await supabase.rpc('exec_sql', {
        sql_query: `
            SELECT constraint_name, constraint_type
            FROM information_schema.table_constraints
            WHERE table_name = 'pick_waves';
        `
    });
    console.log("Constraints from info_schema:", allConstraints);
}

debug();
