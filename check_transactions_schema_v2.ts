
import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function checkTransactionsSchema() {
    console.log("Checking transactions table schema...")

    // Check columns
    const { data: columns, error } = await supabase
        .rpc('get_table_columns', { table_name: 'transactions' })

    if (error) {
        console.log("RPC get_table_columns failed, trying select * limit 1")
        const { data, error: selectError } = await supabase
            .from('transactions')
            .select('*')
            .limit(1)

        if (selectError) {
            console.error("Select failed:", selectError)
        } else if (data && data.length > 0) {
            console.log("Columns found via select:", Object.keys(data[0]))
        } else {
            // If empty, try to insert a dummy (and rollback/fail) or better, check information_schema via SQL if possible?
            // Since we can't run arbitrary SQL easily, we will rely on checking if inserting without warehouse_id works?
            console.log("Table empty.")
        }
    } else {
        console.log("Columns:", columns)
    }
}

checkTransactionsSchema().catch(console.error)
