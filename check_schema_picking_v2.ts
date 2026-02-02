
import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function checkPickingSchema() {
    // 1. Try simple select on 'picking_jobs'
    const { data, error } = await supabase.from('picking_jobs').select('*').limit(1)
    if (error) {
        console.log('Error selecting picking_jobs', error.message)
    } else {
        console.log('Picking Jobs columns:', data && data.length > 0 ? Object.keys(data[0]) : 'Table exists (empty)')
    }

    // 2. Try to list ALL tables via RPC if available, or just guess
    const { data: cols, error: err } = await supabase.rpc('get_table_columns', { table_name: 'picking_jobs' })
    if (!err) console.log('Picking Jobs columns (RPC):', cols)
}

checkPickingSchema()
