
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'

// Simple env loader
const envPath = path.resolve(process.cwd(), '.env.local')
const envContent = fs.readFileSync(envPath, 'utf-8')
const env: Record<string, string> = {}
envContent.split('\n').forEach(line => {
    const [key, val] = line.split('=')
    if (key && val) env[key.trim()] = val.trim().replace(/"/g, '')
})

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
    console.error("Missing Env Vars")
    process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } })

async function run() {
    console.log("🔍 Starting Delete Order Verification...")

    // 1. Create a Dummy Order to Delete
    console.log("📝 Creating valid dummy order...")
    const { data: order, error: createError } = await supabase
        .from('orders')
        .insert({
            code: `DEL-TEST-${Date.now()}`,
            customer_name: "Delete Test Customer",
            status: 'PENDING',
            type: 'ITEM'
        })
        .select()
        .single()

    if (createError || !order) {
        console.error("❌ Failed to create dummy order:", createError)
        return
    }
    console.log(`✅ Created Order: ${order.code} (${order.id})`)

    // 2. Call Delete API
    console.log("🚀 Calling API /api/orders/delete...")
    try {
        const res = await fetch('http://localhost:3000/api/orders/delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ orderId: order.id })
        })
        const json = await res.json()
        console.log("📥 API Response:", json)

        if (!json.success) {
            console.error("❌ API returned failure:", json)
            return
        }

        // 3. Verify DB - Should be gone
        console.log("🕵️ Checking Database (Expect Null)...")
        const { data: check, error: checkError } = await supabase
            .from('orders')
            .select('*')
            .eq('id', order.id)
            .single()

        // Supabase returns error code 'PGRST116' (row not found) which is what we want, OR simple null data
        if (!check) {
            console.log("✅ VERIFICATION PASSED: Order not found in DB.")
        } else {
            console.error("❌ VERIFICATION FAILED: Order still exists!", check)
        }

    } catch (err) {
        console.error("❌ Exception during API call:", err)
    }
}

run()
