
import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function checkColumns() {
    console.log("Checking picking_tasks columns...")
    const { data, error } = await supabase
        .from('picking_tasks')
        .select('*')
        .limit(1)

    if (error) {
        console.log("Error:", error.message) // Look for specific format like "Could not find..."
        // Or if data is empty we can't see keys. 
        // Try selecting specific columns to test existence?
        return
    }

    if (data && data.length > 0) {
        console.log("Columns found:", Object.keys(data[0]))
    } else {
        // Empty table. Try insert a dummy to see error or use introspection if possible.
        // But user said "chỗ này là job_id".
        console.log("Table empty. Trying to guess columns...")

        // Test job_id
        const { error: errJob } = await supabase.from('picking_tasks').select('job_id').limit(1)
        if (!errJob) console.log("✅ 'job_id' exists")
        else console.log("❌ 'job_id' error:", errJob.message)

        // Test picking_job_id
        const { error: errPick } = await supabase.from('picking_tasks').select('picking_job_id').limit(1)
        if (!errPick) console.log("✅ 'picking_job_id' exists")
        else console.log("❌ 'picking_job_id' error:", errPick.message)
    }
}

checkColumns()
