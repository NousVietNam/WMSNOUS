
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function applySql(filePath) {
    const fullPath = path.isAbsolute(filePath) ? filePath : path.resolve(filePath);
    const sql = fs.readFileSync(fullPath, 'utf8');
    console.log(`🚀 Applying ${path.basename(filePath)}...`);

    const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql });

    if (error) {
        console.error(`❌ Error:`, error);
    } else {
        console.log(`✅ Success!`);
    }
}

const file = process.argv[2];
if (!file) {
    console.error("Please provide a file path.");
} else {
    applySql(file);
}
