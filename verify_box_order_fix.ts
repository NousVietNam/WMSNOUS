
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'

// Simple env loader
const envPath = path.resolve(process.cwd(), '.env.local')
const envContent = fs.readFileSync(envPath, 'utf-8')
const env: Record<string, string> = {}
envContent.split('\n').forEach(line => {
    const [key, val] = line.split('=')
    if (key && val) env[key.trim()] = val.trim().replace(/"/g, '') // remove quotes
})

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
    console.error("Missing Env Vars")
    process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } })

async function run() {
    console.log("🔍 Starting Verification...")

    // 1. Find a Box
    const { data: boxes } = await supabase.from('boxes').select('id, code').limit(1)
    if (!boxes || boxes.length === 0) {
        console.error("⚠️ No boxes found to test.")
        return
    }
    const box = boxes[0]
    console.log(`📦 Using Box: ${box.code} (${box.id})`)

    // 2. Prepare Payload
    const code = `TEST-BOX-${Date.now()}`
    const payload = {
        code,
        customerName: "Auto Test Verification",
        type: "BOX",
        boxes: [box]
    }

    // 3. Call API
    console.log("🚀 Calling API /api/orders/create...")
    try {
        const res = await fetch('http://localhost:3000/api/orders/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        })
        const json = await res.json()
        console.log("📥 API Response:", json)

        if (!json.success) {
            console.error("❌ API returned failure:", json)
            return
        }

        // 4. Verify DB
        console.log("🕵️ Checking Database...")
        const { data: order, error } = await supabase
            .from('orders')
            .select('*')
            .eq('id', json.orderId)
            .single()

        if (error) {
            console.error("❌ DB Query Failed:", error)
            return
        }

        console.log(`📝 Order Found: Code=${order.code}, Type=${order.type}`)

        if (order.type === 'BOX') {
            console.log("✅ VERIFICATION PASSED: Order Type is 'BOX'.")
        } else {
            console.error(`❌ VERIFICATION FAILED: Expected 'BOX', got '${order.type}'.`)
        }

    } catch (err) {
        console.error("❌ Exception:", err)
    }
}

run()
