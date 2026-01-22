const { createClient } = require('@supabase/supabase-js')

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials')
    process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function cleanupOldJobs() {
    try {
        console.log('🗑️  Finding old PENDING jobs...\n')

        const { data: jobs, error: fetchError } = await supabase
            .from('picking_jobs')
            .select('id, code, status, created_at')
            .eq('status', 'PENDING')

        if (fetchError) {
            console.error('❌ Error:', fetchError)
            return
        }

        if (!jobs || jobs.length === 0) {
            console.log('ℹ️  No PENDING jobs found')
            return
        }

        console.log(`Found ${jobs.length} PENDING jobs`)
        const jobIds = jobs.map(j => j.id)

        // Step 1: Set picking_job_id to NULL in outbound_shipments
        console.log('\n🔄 Setting picking_job_id to NULL in outbound_shipments...')
        const { error: nullifyError } = await supabase
            .from('outbound_shipments')
            .update({ picking_job_id: null })
            .in('picking_job_id', jobIds)

        if (nullifyError) {
            console.error('❌ Error:', nullifyError)
            return
        }
        console.log('✅ Nullified shipment references')

        // Step 2: Delete picking_tasks
        console.log('\n🗑️  Deleting picking_tasks...')
        const { error: tasksError } = await supabase
            .from('picking_tasks')
            .delete()
            .in('job_id', jobIds)

        if (tasksError) {
            console.error('❌ Error:', tasksError)
            return
        }
        console.log('✅ Deleted picking tasks')

        // Step 3: Delete jobs
        console.log('\n🗑️  Deleting picking_jobs...')
        const { error: jobsError } = await supabase
            .from('picking_jobs')
            .delete()
            .in('id', jobIds)

        if (jobsError) {
            console.error('❌ Error:', jobsError)
            return
        }
        console.log(`✅ Deleted ${jobs.length} old jobs`)

        // Step 4: Reset ALLOCATED orders
        console.log('\n🔄 Resetting ALLOCATED orders to APPROVED...')
        const { data: allocated, error: allocError } = await supabase
            .from('outbound_orders')
            .select('id, code')
            .eq('status', 'ALLOCATED')

        if (allocError) {
            console.error('❌ Error:', allocError)
        } else if (allocated && allocated.length > 0) {
            console.log(`Found ${allocated.length} ALLOCATED orders:`)
            allocated.forEach((o, i) => console.log(`  ${i + 1}. ${o.code}`))

            const { error: resetError } = await supabase
                .from('outbound_orders')
                .update({ status: 'APPROVED' })
                .eq('status', 'ALLOCATED')

            if (resetError) {
                console.error('❌ Error:', resetError)
            } else {
                console.log(`✅ Reset ${allocated.length} orders to APPROVED`)
            }
        } else {
            console.log('ℹ️  No ALLOCATED orders found')
        }

        console.log('\n✅ Cleanup complete!')

    } catch (e) {
        console.error('❌ Error:', e)
    }
}

cleanupOldJobs()
