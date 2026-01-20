import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function checkSchema() {
    // Get existing picking_jobs to see what statuses are valid
    const { data: jobs } = await supabase
        .from('picking_jobs')
        .select('id, status, type')
        .limit(5)

    console.log("Existing jobs:", jobs)

    // Try different status values
    const testStatuses = ['PENDING', 'pending', 'OPEN', 'open', 'IN_PROGRESS', 'in_progress']

    for (const status of testStatuses) {
        const { error } = await supabase
            .from('picking_jobs')
            .insert({ status, type: 'TEST' })
            .select()

        if (!error) {
            console.log(`✅ Status '${status}' is VALID`)
            // Delete test
            await supabase.from('picking_jobs').delete().eq('type', 'TEST')
            break
        } else {
            console.log(`❌ Status '${status}' failed: ${error.message}`)
        }
    }
}

checkSchema().catch(console.error)
