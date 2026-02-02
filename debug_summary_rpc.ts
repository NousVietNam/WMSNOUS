
import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function debugSummary() {
    console.log("Testing get_inventory_bulk_summary...")
    const { data, error } = await supabase.rpc('get_inventory_bulk_summary', {
        p_search: 'S26NB2-A01-F01-SN-S'
    })

    if (error) {
        console.error("RPC Error:", error)
    } else {
        console.log("RPC Result:", data)
    }
}

debugSummary()
