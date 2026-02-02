
import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function checkPickingSchema() {
    const tables = ['picking_jobs', 'picking_list', 'picking_batch'] // Guessing names

    // List all public tables to see what we have
    const { data: allTables } = await supabase
        .from('information_schema.tables')
        .select('table_name')
        .eq('table_schema', 'public')

    console.log("All Tables:", allTables?.map(t => t.table_name).filter(n => n.includes('pick')))

    const { data: jobCols } = await supabase.rpc('get_table_columns', { table_name: 'picking_jobs' })
    console.log("Picking Jobs:", jobCols)
}

checkPickingSchema()
