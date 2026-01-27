
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey || supabaseKey);

async function testRpc() {
    console.log("------- TEST 1: Calling get_inventory_grouped (EXISTING) -------");
    const { data: data1, error: error1 } = await supabase.rpc('get_inventory_grouped', {
        p_page: 0,
        p_page_size: 1,
        p_warehouse_id: null,
        p_location_code: null,
        p_box_code: null,
        p_brand: null,
        p_target_audience: null,
        p_product_group: null,
        p_season: null,
        p_launch_month: null,
        p_search: null
    });

    if (error1) {
        console.error("Existing RPC Error:", JSON.stringify(error1, null, 2));
    } else {
        console.log("Existing RPC Success. Data length:", data1?.length);
    }

    console.log("\n------- TEST 2: Calling get_inventory_bulk_grouped (NEW) -------");
    const { data, error } = await supabase.rpc('get_inventory_bulk_grouped', {
        p_page: 0,
        p_page_size: 50,
        p_warehouse_id: null,
        p_location_code: null,
        p_box_code: null,
        p_brand: null,
        p_target_audience: null,
        p_product_group: null,
        p_season: null,
        p_launch_month: null,
        p_search: null
    });

    if (error) {
        console.error("New RPC Error:", JSON.stringify(error, null, 2));
    } else {
        console.log("New RPC Success. Data length:", data?.length);
        if (data?.length > 0) console.log("First item:", data[0]);
    }

    console.log("\n------- TEST 3: Calling get_test_simple (DEBUG) -------");
    const { data: data3, error: error3 } = await supabase.rpc('get_test_simple');
    if (error3) {
        console.error("Simple RPC Error:", JSON.stringify(error3, null, 2));
    } else {
        console.log("Simple RPC Success. Data:", data3);
    }
    console.log("\n------- TEST 4: Querying view_product_availability_bulk (VIEW) -------");
    const { data: data4, error: error4 } = await supabase
        .from('view_product_availability_bulk')
        .select('*')
        .limit(1);

    if (error4) {
        console.error("View Query Error:", JSON.stringify(error4, null, 2));
    } else {
        console.log("View Query Success. Data:", data4);
    }
    console.log("\n------- TEST 5: Calling get_inventory_bulk_grouped_v2 (RPC V2) -------");
    const { data: data5, error: error5 } = await supabase.rpc('get_inventory_bulk_grouped_v2', {
        p_page: 0,
        p_page_size: 50,
        p_warehouse_id: null,
        p_location_code: null,
        p_box_code: null,
        p_brand: null,
        p_target_audience: null,
        p_product_group: null,
        p_season: null,
        p_launch_month: null,
        p_search: null
    });

    if (error5) {
        console.error("V2 RPC Error:", JSON.stringify(error5, null, 2));
    } else {
        console.log("V2 RPC Success. Data length:", data5?.length);
    }
    console.log("\n------- TEST 6: Querying view_bulk_inventory_v2 (VIEW V2) -------");
    const { data: data6, error: error6 } = await supabase
        .from('view_bulk_inventory_v2')
        .select('*')
        .limit(1);

    if (error6) {
        console.error("View V2 Query Error:", JSON.stringify(error6, null, 2));
    } else {
        console.log("View V2 Query Success. Data:", data6);
    }
}

testRpc();