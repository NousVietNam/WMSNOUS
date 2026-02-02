
import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function checkSchema() {
    const { data, error } = await supabase.from('outbound_order_items').select('*').limit(1)
    if (data && data.length > 0) {
        console.log("Columns:", Object.keys(data[0]))
    } else {
        // If empty, try RPC or just insert a dummy to fail and see cols? No, safer to use RPC if possible or assumes standard.
        // Or check information_schema
        const { data: cols } = await supabase.rpc('get_table_columns', { table_name: 'outbound_order_items' })
        console.log("Columns (RPC):", cols)
    }
}

checkSchema()
