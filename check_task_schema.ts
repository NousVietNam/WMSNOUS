
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
    console.log("🔍 Checking Picking Tasks Schema via SQL hack or direct select...")

    // Attempt to insert a dummy record with box_id to see if it errors
    // Actually, just reading columns from a known record or using rpc if available.
    // Simplest: Insert with invalid ID and see error "column box_id does not exist" vs "constraint violation"

    const { error } = await supabase.from('picking_tasks').select('box_id').limit(1)

    if (error) {
        if (error.message.includes('does not exist')) {
            console.log("❌ 'box_id' column DOES NOT EXIST on picking_tasks.")
        } else {
            console.log("⚠️ Unknown error checking column: " + error.message)
            // It might exist but other error
            console.log("Assumption: It exists if no 404 on column.")
        }
    } else {
        console.log("✅ 'box_id' column EXISTS on picking_tasks.")
    }
}
run()
