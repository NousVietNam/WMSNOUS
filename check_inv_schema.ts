
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
    console.log("🔍 Checking Inventory Items Schema...")
    const { data: inv, error } = await supabase.from('inventory_items').select('*').limit(1)
    if (inv && inv.length > 0) {
        console.log("✅ Inventory Columns:", Object.keys(inv[0]))
    } else {
        console.log("⚠️ No inventory or error:", error)
    }
}
run()
