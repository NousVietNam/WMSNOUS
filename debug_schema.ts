
import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function debugSchemaAndRPC() {
    console.log("--- CHECKING LOCATIONS SCHEMA ---")
    const { data: locData, error: locError } = await supabase
        .from('locations')
        .select('*')
        .limit(1)

    if (locError) {
        console.error("Locations Error:", locError)
    } else if (locData && locData.length > 0) {
        console.log("Locations Columns:", Object.keys(locData[0]))
    } else {
        console.log("Locations table empty, checking INFORMATION_SCHEMA...")
        // Fallback if empty
        const { data: cols } = await supabase.rpc('exec_sql', {
            sql_query: "SELECT column_name FROM information_schema.columns WHERE table_name = 'locations'"
        })
        console.log("Schema Query Result:", cols)
    }

    console.log("\n--- CHECKING BOXES SCHEMA ---")
    const { data: boxData } = await supabase
        .from('boxes')
        .select('*')
        .limit(1)

    if (boxData && boxData.length > 0) {
        console.log("Boxes Columns:", Object.keys(boxData[0]))
    }
}

debugSchemaAndRPC()
