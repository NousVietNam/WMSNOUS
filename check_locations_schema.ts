
import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function checkLocationsSchema() {
    console.log("Checking locations table schema...")

    // Check columns
    const { data: columns, error } = await supabase
        .rpc('get_table_columns', { table_name: 'locations' })

    // Fallback if rpc missing, try to just select * from locations limit 1
    if (error) {
        console.log("RPC get_table_columns failed, trying select * limit 1")
        const { data, error: selectError } = await supabase
            .from('locations')
            .select('*')
            .limit(1)

        if (selectError) {
            console.error("Select failed:", selectError)
        } else if (data && data.length > 0) {
            console.log("Columns found via select:", Object.keys(data[0]))
        } else {
            console.log("Table exists but is empty, cannot infer columns from data.")
        }
    } else {
        console.log("Columns:", columns)
    }

    // Also try to find a sample location starting with common prefixes
    const prefixes = ['L', 'LOC', 'A', 'B', 'C', 'X', 'Y', 'Z', 'S', 'T']

    for (const p of prefixes) {
        const { data } = await supabase.from('locations').select('code').ilike('code', `${p}%`).limit(3)
        if (data && data.length > 0) {
            console.log(`Found locations starting with ${p}:`, data)
        }
    }
}

checkLocationsSchema().catch(console.error)
