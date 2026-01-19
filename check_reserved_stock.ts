
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

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

async function run() {
    console.log("🔍 Checking Sources of 'Hàng Giữ' (Approved Stock)...")

    // 1. Check Approved Orders
    const { data: orders, error: orderError } = await supabase
        .from('orders')
        .select(`id, code, status, is_approved, order_items(id, quantity, products(sku))`)
        .eq('is_approved', true) // Only approved count towards "Hàng Giữ"
        .neq('status', 'SHIPPED')
        .neq('status', 'COMPLETED')

    if (orderError) console.error("❌ Error fetching Orders:", orderError)
    else if (orders && orders.length > 0) {
        console.log(`⚠️ Found ${orders.length} Approved Orders (Contributing to Hàng Giữ):`)
        orders.forEach(o => {
            console.log(`- Order [${o.code}] Status: ${o.status}. Items: ${o.order_items.reduce((s, i) => s + i.quantity, 0)}`)
        })
    } else {
        console.log("✅ No Approved Orders found.")
    }

    // 2. Check Approved Transfers
    const { data: transfers, error: transferError } = await supabase
        .from('transfer_orders')
        .select(`id, code, status, transfer_order_items(id, quantity, products(sku))`)
        .eq('status', 'approved') // Approved transfers count towards "Hàng Giữ"

    if (transferError) console.error("❌ Error fetching Transfers:", transferError)
    else if (transfers && transfers.length > 0) {
        console.log(`⚠️ Found ${transfers.length} Approved Transfers (Contributing to Hàng Giữ):`)
        transfers.forEach(t => {
            console.log(`- Transfer [${t.code}] Status: ${t.status}. Items: ${t.transfer_order_items.reduce((s, i) => s + (i.quantity || 0), 0)}`)
        })
    } else {
        console.log("✅ No Approved Transfers found.")
    }
}
run()
