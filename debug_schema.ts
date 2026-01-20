
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function checkSchema() {
    console.log("Checking picking_tasks schema...")
    const { data, error } = await supabase
        .from('picking_tasks')
        .select('outbox_code')
        .limit(1)

    if (error) {
        console.error("❌ Schema Check Failed:", error.message)
        console.log("Likely 'outbox_code' column is missing.")
    } else {
        console.log("✅ Schema Check Passed: 'outbox_code' column exists.")
    }
}

checkSchema()
