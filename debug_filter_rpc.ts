
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import path from 'path'

// Load env from .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function testRpc() {
    console.log("Testing RPC 'get_inventory_filter_options'...")
    const { data, error } = await supabase.rpc('get_inventory_filter_options', {
        p_warehouse_id: null,
        p_location_code: null,
        p_box_code: null,
        p_brand: null,
        p_target_audience: null,
        p_product_group: null,
        p_season: null,
        p_launch_month: null
    })

    if (error) {
        console.error("RPC Error:", error.message)
        console.log("DETAILS:", error.details)
        console.log("HINT:", error.hint)
    } else {
        console.log("RPC Success!")
        if (data && data.length > 0) {
            console.log("Data Keys:", Object.keys(data[0]))
            console.log("Sample Brands:", data[0].brands?.slice(0, 3))
        } else {
            console.log("RPC returned no data (empty array)")
        }
    }
}

testRpc()
