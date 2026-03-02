const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function dropTypoViews() {
    console.log("=== DROP OBSOLETE VIEWS WITH TYPOS ===\n");

    // Check existing views before
    console.log("1. Checking existing product views BEFORE cleanup...");
    const { data: viewsBefore } = await supabase.rpc('exec_sql', {
        sql: `SELECT table_name FROM information_schema.views WHERE table_schema = 'public' AND table_name LIKE 'view_product%' ORDER BY table_name;`
    });

    // Alternative: query via pg_views
    const { data: pgViews, error: pgError } = await supabase
        .from('pg_views')
        .select('viewname')
        .like('viewname', 'view_product%');

    if (pgViews) {
        console.log("   Views found:", pgViews.map(v => v.viewname).join(', '));
    }

    // Drop the views with typos
    console.log("\n2. Dropping view_product_avalibility_bulk...");
    const { error: err1 } = await supabase.rpc('exec_sql', {
        sql: 'DROP VIEW IF EXISTS view_product_avalibility_bulk CASCADE;'
    });

    if (err1) {
        // Try alternative method - direct query
        console.log("   RPC not available, views need to be dropped via SQL Editor");
    } else {
        console.log("   ✅ Dropped successfully");
    }

    console.log("\n3. Dropping view_product_avalibility_retail...");
    const { error: err2 } = await supabase.rpc('exec_sql', {
        sql: 'DROP VIEW IF EXISTS view_product_avalibility_retail CASCADE;'
    });

    if (err2) {
        console.log("   RPC not available, views need to be dropped via SQL Editor");
    } else {
        console.log("   ✅ Dropped successfully");
    }

    // Verify by checking if views still exist
    console.log("\n4. Verifying cleanup by checking remaining views...");

    // Check view_product_avalibility_bulk
    const { data: check1, error: checkErr1 } = await supabase
        .from('view_product_avalibility_bulk')
        .select('*')
        .limit(1);

    if (checkErr1 && checkErr1.message.includes('does not exist')) {
        console.log("   ✅ view_product_avalibility_bulk: DELETED (or never existed)");
    } else if (check1 !== null) {
        console.log("   ⚠️  view_product_avalibility_bulk: STILL EXISTS - need manual deletion");
    }

    // Check view_product_avalibility_retail  
    const { data: check2, error: checkErr2 } = await supabase
        .from('view_product_avalibility_retail')
        .select('*')
        .limit(1);

    if (checkErr2 && checkErr2.message.includes('does not exist')) {
        console.log("   ✅ view_product_avalibility_retail: DELETED (or never existed)");
    } else if (check2 !== null) {
        console.log("   ⚠️  view_product_avalibility_retail: STILL EXISTS - need manual deletion");
    }

    // Check correct views still work
    console.log("\n5. Verifying correct views still work...");
    const { data: v1, error: e1 } = await supabase
        .from('view_product_availability')
        .select('*')
        .limit(1);
    console.log(`   view_product_availability: ${e1 ? '❌ ERROR' : '✅ OK'}`);

    const { data: v2, error: e2 } = await supabase
        .from('view_product_availability_bulk')
        .select('*')
        .limit(1);
    console.log(`   view_product_availability_bulk: ${e2 ? '❌ ERROR' : '✅ OK'}`);

    console.log("\n=== CLEANUP COMPLETE ===");
    console.log("\nIf views still exist, run this SQL in Supabase SQL Editor:");
    console.log("DROP VIEW IF EXISTS view_product_avalibility_bulk CASCADE;");
    console.log("DROP VIEW IF EXISTS view_product_avalibility_retail CASCADE;");
}

dropTypoViews().catch(console.error);
