
import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function checkQuantity() {
    console.log("Checking quantity column...")
    const { data, error } = await supabase
        .from('picking_tasks')
        .select('quantity')
        .limit(1)

    if (error) {
        console.log("Error:", error.message)
    } else {
        console.log("✅ 'quantity' exists.")
    }
}

checkQuantity()
