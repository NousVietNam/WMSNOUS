
import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function checkColumns() {
    console.log("Checking columns for 'bulk_inventory', 'boxes', 'locations'...")

    // Check bulk_inventory
    const { data: bulkCols } = await supabase.rpc('exec_sql', {
        sql_query: "SELECT column_name FROM information_schema.columns WHERE table_name = 'bulk_inventory';"
    })
    console.log("Bulk Inventory Columns:", bulkCols)

    // Check boxes
    const { data: boxCols } = await supabase.rpc('exec_sql', {
        sql_query: "SELECT column_name FROM information_schema.columns WHERE table_name = 'boxes';"
    })
    console.log("Boxes Columns:", boxCols)

    // Check locations
    const { data: locCols } = await supabase.rpc('exec_sql', {
        sql_query: "SELECT column_name FROM information_schema.columns WHERE table_name = 'locations';"
    })
    console.log("Locations Columns:", locCols)
}

checkColumns()
