
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
    console.log("🔍 Checking Transactions & Orphaned Items...")

    // 1. Check Transactions (RESERVE)
    const { data: trans, error } = await supabase
        .from('transactions')
        .select('*')
        .eq('type', 'RESERVE')

    if (error) console.error("❌ Trans Error:", error)
    else if (trans && trans.length > 0) {
        console.log(`⚠️ Found ${trans.length} RESERVE transactions in Database. (Might be source if RPC uses them).`)
        trans.forEach(t => console.log(`   - ID: ${t.id}, Qty: ${t.quantity}, Type: ${t.type}`))
    } else {
        console.log("✅ No RESERVE transactions found.")
    }

    // 2. Check Order Items that might be linked to non-existent orders OR orders that are approved
    // Actually, let's just sum all order_items where order.is_approved = true
    const { data: items, error: itemError } = await supabase
        .from('order_items')
        .select(`id, quantity, orders!inner(id, is_approved, status)`)
        .eq('orders.is_approved', true) // Only approved

    if (itemError) console.error("❌ Item Error:", itemError)
    else if (items && items.length > 0) {
        console.log(`⚠️ Found Order Items from Approved Orders:`)
        const total = items.reduce((s, i) => s + i.quantity, 0)
        console.log(`   - Total Quantity: ${total}`)
        items.forEach(i => console.log(`   - Item from Order ${i.orders.id} (${i.orders.status})`))
    } else {
        console.log("✅ No Approved Order Items found.")
    }
}

run()
