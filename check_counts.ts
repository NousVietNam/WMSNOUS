
import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function checkCounts() {
    const { count: locCount } = await supabase.from('locations').select('*', { count: 'exact', head: true })
    console.log("Total Locations:", locCount)

    const { count: txCount } = await supabase.from('transactions').select('*', { count: 'exact', head: true })
    console.log("Total Transactions:", txCount)
}

checkCounts().catch(console.error)
