
import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function debugOutboundSchema() {
    console.log("--- CHECKING OUTBOUND ORDERS SCHEMA ---")
    const { data: cols, error } = await supabase
        .from('outbound_orders')
        .select('*')
        .limit(1)

    if (cols && cols.length > 0) {
        console.log("Columns:", Object.keys(cols[0]))
    } else {
        console.log("Empty or Error:", error || "No rows")
        // Fallback check info schema
        const { data: schemaCols } = await supabase.rpc('exec_sql', {
            sql_query: "SELECT column_name FROM information_schema.columns WHERE table_name = 'outbound_orders'"
        })
        console.log("Schema Query Result:", schemaCols)
    }
}

debugOutboundSchema()
