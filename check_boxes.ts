
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
    console.log("🔍 Checking Boxes Schema...")
    const { data: box, error } = await supabase.from('boxes').select('*').limit(1)
    if (box && box.length > 0) {
        console.log("✅ Boxes Columns:", Object.keys(box[0]))
    } else {
        console.log("⚠️ No boxes or error:", error)
    }
}
run()
