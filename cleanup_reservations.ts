
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
    console.log("🧹 Starting Cleanup...")

    // 1. Delete Orphaned RESERVE Transactions
    // (We simply delete ALL reserve transactions if there are no Active Approved Orders, based on user input 'Deleted all orders')
    // But to be safe, let's just delete ALL 'RESERVE' transactions that are linked to deleted orders.
    // However, since we don't have a strict foreign key or easy way to check existence in one query via JS...
    // We will just fetch all ORDERS. If Order List is empty, we delete ALL Reserve Transactions.

    const { data: orders } = await supabase.from('orders').select('id')
    if (!orders || orders.length === 0) {
        console.log("No orders found. Deleting ALL 'RESERVE' transactions...")
        const { error } = await supabase
            .from('transactions')
            .delete()
            .eq('type', 'RESERVE')
        if (error) console.error("Error deleting transactions:", error)
        else console.log("✅ Deleted orphaned transactions.")
    } else {
        console.log("⚠️ Orders exist. Attempting targeted cleanup (advanced logic skipped for safety, verify manually).")
    }

    // 2. Reset Allocated Quantity to 0 (Assuming 'Delete all orders' means no allocations should exist)
    // Only run this if we are sure (user prompt or logic).
    // Let's check picking_jobs first.
    const { data: jobs } = await supabase.from('picking_jobs').select('id')
    if (!jobs || jobs.length === 0) {
        console.log("No picking jobs found. Resetting inventory allocations...")
        const { error: invError } = await supabase
            .from('inventory_items')
            .update({ allocated_quantity: 0 })
            .gt('allocated_quantity', 0)

        if (invError) console.error("Error resetting inventory:", invError)
        else console.log("✅ Reset inventory allocations.")
    }

    console.log("Cleanup Complete.")
}

run()
