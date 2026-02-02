
import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function debugBothSummaries() {
    const searchTerm = 'S26NB2-A01-F01-SN-S'
    // const searchTerm = null // Try null too if needed

    console.log("--- DEBUGGING RETAIL SUMMARY ---")
    const { data: retailData, error: retailError } = await supabase.rpc('get_inventory_summary', {
        p_search: searchTerm
    })
    if (retailError) console.error("Retail Error:", retailError)
    else console.log("Retail Result:", retailData)

    console.log("\n--- DEBUGGING BULK SUMMARY ---")
    const { data: bulkData, error: bulkError } = await supabase.rpc('get_inventory_bulk_summary', {
        p_search: searchTerm
    })
    if (bulkError) console.error("Bulk Error:", bulkError)
    else console.log("Bulk Result:", bulkData)
}

debugBothSummaries()
