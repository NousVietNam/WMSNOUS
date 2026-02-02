
import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function testSuggestion() {
    console.log("Testing Smart Wave Suggestion...")

    // Call the RPC
    const { data, error } = await supabase.rpc('suggest_bulk_waves', {
        p_min_similarity: 0.1, // Low threshold for test
        p_max_orders: 5
    })

    if (error) {
        console.error("RPC Failed:", error)
        process.exit(1)
    }

    console.log("Suggestion Result:", JSON.stringify(data, null, 2))
}

testSuggestion()
