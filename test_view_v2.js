
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey || supabaseKey);

async function testView() {
    console.log("------- TEST VIEW V2 -------");
    const { data, error, count } = await supabase
        .from('view_bulk_inventory_v2')
        .select('*', { count: 'exact' })
        .limit(5);

    if (error) {
        console.error("View V2 Error:", JSON.stringify(error, null, 2));
    } else {
        console.log("View V2 Success. Count:", count);
        console.log("Data:", JSON.stringify(data, null, 2));
    }
}

testView();
