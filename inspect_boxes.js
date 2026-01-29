
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envPath = path.resolve(__dirname, '.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
    const [key, val] = line.split('=');
    if (key && val) env[key.trim()] = val.trim();
});

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function inspect() {
    console.log("Fetching one row from boxes...");
    const { data, error } = await supabase
        .from('boxes')
        .select('*')
        .limit(1);

    if (error) {
        console.error("Error:", error);
    } else if (data && data.length > 0) {
        console.log("Columns:", Object.keys(data[0]));
    } else {
        // If no row, creating dummy to check cols? No, let's just assume empty.
        // We can try selecting that specific column to confirm failure
        console.log("Table empty or other issue. Attempting to select 'warehouse_id' from boxes...");
        const { error: colError } = await supabase.from('boxes').select('warehouse_id').limit(1);
        if (colError) console.log("Confirmation of error:", colError.message);
        else console.log("Column seems to exist? No error requesting it.");
    }
}

inspect();
