
import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function checkSchema() {
    console.log("Checking locations columns...")
    const { data: locData, error: locError } = await supabase
        .from('locations')
        .select('*')
        .limit(1)

    if (locError) {
        console.log("Locations Error:", locError.message)
    } else if (locData && locData.length > 0) {
        console.log("Locations Columns:", Object.keys(locData[0]))
    } else {
        console.log("Locations table is empty.")
    }

    console.log("\nChecking transactions columns...")
    const { data: txData, error: txError } = await supabase
        .from('transactions')
        .select('*')
        .limit(1)

    if (txError) {
        console.log("Transactions Error:", txError.message)
    } else if (txData && txData.length > 0) {
        console.log("Transactions Columns:", Object.keys(txData[0]))
    } else {
        console.log("Transactions table is empty.")
    }
}

checkSchema().catch(console.error)
