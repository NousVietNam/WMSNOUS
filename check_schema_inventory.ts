
import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function checkSchema() {
    console.log("Checking tables...")
    const tables = ['bulk_inventory', 'inventory_items', 'outbound_orders', 'outbound_items']

    for (const t of tables) {
        const { data, error } = await supabase.rpc('get_table_columns', { table_name: t })
        if (error) {
            // Fallback to select limit 1
            const { data: selData, error: selError } = await supabase.from(t).select('*').limit(1)
            if (selError) console.log(`Table ${t} error:`, selError.message)
            else console.log(`Table ${t} columns (via select):`, selData && selData.length > 0 ? Object.keys(selData[0]) : "Empty table")
        } else {
            console.log(`Table ${t} schema:`, data)
        }
    }
}

checkSchema()
