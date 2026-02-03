
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function debug() {
    console.log("Testing get_inventory_filter_options for PIECE...");

    const params = {
        p_warehouse_id: null,
        p_location_code: null,
        p_box_code: null,
        p_brand: null,
        p_target_audience: null,
        p_product_group: null,
        p_season: null,
        p_launch_month: null,
        p_inventory_type: 'PIECE'
    };

    const { data, error } = await supabase.rpc('get_inventory_filter_options', params);

    if (error) {
        console.error("RPC Error:", error);
    } else {
        // Just print counts to verify structure
        const res = data[0];
        console.log("Result (Counts):");
        console.log("Locations:", res.locations ? res.locations.length : 0);
        console.log("Boxes:", res.boxes ? res.boxes.length : 0);
        console.log("Brands:", res.brands ? res.brands.length : 0);
    }
}

debug();
