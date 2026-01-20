
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
    console.log("🔍 Checking order_items Schema...")
    const { data, error } = await supabase
        .from('order_items')
        .select('*')
        .limit(1)

    if (error) {
        console.log("Error:", error.message)
        return
    }

    if (data && data.length > 0) {
        console.log("Columns:", Object.keys(data[0]))
    } else {
        // If empty, try to get info via RPC or just assume no data
        console.log("Table empty, cannot infer columns from data.")
    }
}
run()
