
import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function debugPageQuery() {
    console.log("--- TESTING PAGE QUERY ---")
    // Emulate the exact query from page.tsx:33
    const { data, error } = await supabase
        .from('pick_waves')
        .select(`
            *,
            user:users(name)
        `)
        .order('created_at', { ascending: false })

    if (error) {
        console.error("Query Error:", error)
    } else {
        console.log(`Query Success. Rows: ${data?.length}`)
        console.log("Sample Row:", data?.[0])
    }
}

debugPageQuery()
