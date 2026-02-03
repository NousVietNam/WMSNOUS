
import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const supabase = createClient(supabaseUrl!, supabaseServiceKey!)

async function checkTables() {
    const { data, error } = await supabase.rpc('exec_sql_read', {
        sql_query: "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('pick_waves', 'picking_jobs', 'picking_tasks')"
    })

    if (error) console.error(error)
    else console.log('Existing tables:', data)

    const { data: cols, error: colError } = await supabase.rpc('exec_sql_read', {
        sql_query: "SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name IN ('picking_jobs', 'outbound_orders')"
    })
    if (colError) console.error(colError)
    else console.log('Columns:', cols)
}

checkTables()
