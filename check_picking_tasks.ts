
import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function checkSchema() {
    const { data, error } = await supabase.from('picking_tasks').select('*').limit(1)
    if (data && data.length > 0) {
        console.log("Columns:", Object.keys(data[0]))
    } else {
        const { data: cols } = await supabase.rpc('get_table_columns', { table_name: 'picking_tasks' })
        console.log("Columns (RPC):", cols)
    }
}

checkSchema()
