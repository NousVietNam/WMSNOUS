
import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function debugBulkSchema() {
    console.log("\n--- CHECKING BULK INVENTORY SCHEMA ---")
    const { data: bulkData, error } = await supabase
        .from('bulk_inventory')
        .select('*')
        .limit(1)

    if (bulkData && bulkData.length > 0) {
        console.log("Bulk Inv Columns:", Object.keys(bulkData[0]))
    } else if (error) {
        console.error("Bulk Error:", error)
    } else {
        console.log("Bulk Inventory table is empty.")
        // Fallback check info schema
        const { data: cols } = await supabase.rpc('exec_sql', {
            sql_query: "SELECT column_name FROM information_schema.columns WHERE table_name = 'bulk_inventory'"
        })
        console.log("Schema Query Result:", cols)
    }
}

debugBulkSchema()
