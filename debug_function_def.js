
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function debug() {
    console.log("Checking function definition...");
    // We try to call a standard postgres function via RPC if exposed, but likely not.
    // Instead, we use 'exec_sql' if available to get the definition.

    const { data: result, error } = await supabase.rpc('exec_sql', {
        sql_query: "SELECT pg_get_functiondef('approve_outbound'::regproc) as def"
    });

    if (error) {
        console.error("RPC Error:", error);
    } else {
        console.log("Function Definition:");
        // Result might be array of objects
        if (Array.isArray(result) && result.length > 0) {
            console.log(result[0].def);
        } else {
            console.log("No definition returned or empty result:", result);
        }
    }
}

debug();
