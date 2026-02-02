
import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function checkDetailedSchema() {
    console.log("Checking detailed schema via introspection...")

    const tables = ['outbound_orders', 'outbound_items', 'bulk_inventory', 'inventory_items']
    const results = {}

    for (const t of tables) {
        const { data, error } = await supabase.from(t).select('*').limit(1)
        if (error) {
            console.log(`Error selecting from ${t}:`, error.message)
            results[t] = 'Error'
        } else {
            if (data.length > 0) {
                results[t] = Object.keys(data[0])
            } else {
                // Try to insert a dummy to get error with columns? No, dangerous.
                // Just report empty but existing
                results[t] = "Table exists (Empty)"
            }
        }
    }
    console.log(JSON.stringify(results, null, 2))
}

checkDetailedSchema()
