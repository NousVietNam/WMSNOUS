const { createClient } = require('@supabase/supabase-js')

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials')
    process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function findAndDeleteJobs() {
    try {
        console.log('🔍 Searching for jobs with codes from screenshot...\n')

        // The exact codes from the screenshot
        const targetCodes = ['JOB-1F93CC58', 'JOB-O0B97AAA', 'JOB-8CD37D93', 'JOB-COB7C91F']

        // Also try variations (uppercase O vs zero)
        const codeVariations = [
            'JOB-1F93CC58',
            'JOB-O0B97AAA', 'JOB-00B97AAA', // O vs 0
            'JOB-8CD37D93',
            'JOB-COB7C91F', 'JOB-C0B7C91F'  // O vs 0
        ]

        // First, let's list all jobs to see what we have
        const { data: allJobs, error: listError } = await supabase
            .from('picking_jobs')
            .select('id, code, status, created_at')
            .order('created_at', { ascending: false })
            .limit(50)

        if (listError) {
            console.error('❌ Error listing jobs:', listError)
            return
        }

        console.log('All recent jobs:')
        allJobs.forEach((job, i) => {
            console.log(`  ${i + 1}. ${job.code || 'null'} - ${job.status} - ${new Date(job.created_at).toLocaleString('vi-VN')}`)
        })

        // Try to find jobs with those codes
        const { data: jobs, error: fetchError } = await supabase
            .from('picking_jobs')
            .select('id, code, status, created_at')
            .in('code', codeVariations)

        if (fetchError) {
            console.error('❌ Error fetching jobs:', fetchError)
            return
        }

        if (!jobs || jobs.length === 0) {
            console.log('\n⚠️  No jobs found with those exact codes.')
            console.log('The jobs in the screenshot may have already been deleted or have different codes.')
            return
        }

        console.log(`\n✅ Found ${jobs.length} jobs to delete:`)
        jobs.forEach((job, i) => {
            console.log(`  ${i + 1}. ${job.code} - ${job.status} - ${new Date(job.created_at).toLocaleString('vi-VN')}`)
        })

        const jobIds = jobs.map(j => j.id)

        console.log('\n🗑️  Deleting picking_tasks...')
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
        const { error: jobsError } = await supabase
            .from('picking_jobs')
            .delete()
            .in('id', jobIds)

        if (jobsError) {
            console.error('❌ Error deleting jobs:', jobsError)
            return
        }

        console.log(`✅ Successfully deleted ${jobs.length} jobs from screenshot!`)

    } catch (e) {
        console.error('❌ Unexpected error:', e)
    }
}

findAndDeleteJobs()
