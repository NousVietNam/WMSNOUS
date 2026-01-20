
import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function checkSchema() {
    console.log("Checking transactions table info...")

    // We can't see CHECK constraints easily via JS client select.
    // Try to insert a dummy "RESERVE" transaction and see error.

    const { data, error } = await supabase
        .from('transactions')
        .insert({
            type: 'RESERVE',
            quantity: 1,
            note: 'Test Schema Check',
            created_at: new Date().toISOString()
            // Leave other fields null
        })

    if (error) {
        console.error("Insert 'RESERVE' failed:", error)
        console.log("Error details:", JSON.stringify(error, null, 2))
    } else {
        console.log("Insert 'RESERVE' success! Constraints allow it.")
        // Delete it
        // Need to know ID? insert returns data if select() used.
    }
}

checkSchema()
