
import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function checkColumns() {
    console.log("Checking picking_tasks columns...")
    const { data, error } = await supabase
        .from('picking_tasks')
        .select('*')
        .limit(1)

    if (error) {
        console.error("Error:", error)
        return
    }

    if (data && data.length > 0) {
        console.log("Columns found:", Object.keys(data[0]))
        if (data[0].hasOwnProperty('inventory_item_id')) {
            console.log("✅ 'inventory_item_id' exists.")
        } else {
            console.error("❌ 'inventory_item_id' MISSING in result!")
        }
    } else {
        console.log("No data in picking_tasks, cannot check columns dynamically via select *")
        // Try introspection?
    }
}

checkColumns()
