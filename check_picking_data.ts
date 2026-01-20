
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'

const envPath = path.resolve(process.cwd(), '.env.local')
const envContent = fs.readFileSync(envPath, 'utf-8')
const env: Record<string, string> = {}
envContent.split('\n').forEach(line => {
    const [key, val] = line.split('=')
    if (key && val) env[key.trim()] = val.trim().replace(/"/g, '')
})

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

async function run() {
    console.log("🔍 Checking Recent Picking Jobs...")

    // Get the most recent job
    const { data: job, error: jobError } = await supabase
        .from('picking_jobs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

    if (!job) {
        console.log("❌ No Picking Jobs found.")
        return
    }

    console.log(`✅ Found Job ID: ${job.id}`)
    console.log(`   Transfer ID: ${job.transfer_order_id}`)
    console.log(`   Type: ${job.type}`)
    console.log(`   Status: ${job.status}`)

    // Check Tasks
    const { data: tasks, error: taskError } = await supabase
        .from('picking_tasks')
        .select('*')
        .eq('picking_job_id', job.id)

    if (taskError) {
        console.log("❌ Error fetching tasks:", taskError)
    } else if (tasks && tasks.length > 0) {
        console.log(`✅ Found ${tasks.length} Picking Tasks for this job:`)
        tasks.forEach(t => console.log(`   - Task: Product ${t.product_id}, Qty: ${t.quantity}, Loc: ${t.location_id}`))
    } else {
        console.log("⚠️ NO TASKS found for this job. API might have failed to create tasks.")
    }
}
run()
