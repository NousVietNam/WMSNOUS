const { createClient } = require('@supabase/supabase-js')

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials')
    process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function deleteJunkJobs() {
    try {
        console.log('🗑️  Deleting PLANNED jobs created today...\n')

        // Get today's date in local timezone
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        const todayStr = today.toISOString()

        // First, get the jobs
        const { data: jobs, error: fetchError } = await supabase
            .from('picking_jobs')
            .select('id, code, status, created_at')
            .eq('status', 'PLANNED')
            .gte('created_at', todayStr)

        if (fetchError) {
            console.error('❌ Error fetching jobs:', fetchError)
            return
        }

        if (!jobs || jobs.length === 0) {
            console.log('ℹ️  No PLANNED jobs found for today')
            return
        }

        console.log(`Found ${jobs.length} PLANNED jobs to delete:`)
        jobs.forEach((job, i) => {
            console.log(`  ${i + 1}. ID: ${job.id.substring(0, 8)}... - Code: ${job.code || 'null'} - Created: ${new Date(job.created_at).toLocaleString('vi-VN')}`)
        })

        const jobIds = jobs.map(j => j.id)

        console.log('\n🗑️  Deleting picking_tasks...')
        // Delete picking_tasks first (foreign key constraint)
        const { error: tasksError } = await supabase
            .from('picking_tasks')
            .delete()
            .in('job_id', jobIds)

        if (tasksError) {
            console.error('❌ Error deleting tasks:', tasksError)
            return
        }

        console.log('✅ Deleted picking tasks')

        console.log('🗑️  Deleting picking_jobs...')
        // Then delete the jobs
        const { error: jobsError } = await supabase
            .from('picking_jobs')
            .delete()
            .in('id', jobIds)

        if (jobsError) {
            console.error('❌ Error deleting jobs:', jobsError)
            return
        }

        console.log(`✅ Successfully deleted ${jobs.length} junk jobs!`)

    } catch (e) {
        console.error('❌ Unexpected error:', e)
    }
}

deleteJunkJobs()
