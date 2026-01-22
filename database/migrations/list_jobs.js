const { createClient } = require('@supabase/supabase-js')

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials')
    process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function listRecentJobs() {
    try {
        console.log('📋 Listing recent picking jobs...\n')

        const { data: jobs, error } = await supabase
            .from('picking_jobs')
            .select('id, code, status, created_at, outbound_order_id')
            .order('created_at', { ascending: false })
            .limit(20)

        if (error) {
            console.error('❌ Error:', error)
            return
        }

        console.log('Recent jobs:')
        jobs.forEach((job, i) => {
            console.log(`${i + 1}. ${job.code} - Status: ${job.status} - Created: ${new Date(job.created_at).toLocaleString('vi-VN')}`)
        })

    } catch (e) {
        console.error('❌ Unexpected error:', e)
    }
}

listRecentJobs()
