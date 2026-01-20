
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
    console.log("🔍 Checking Triggers on Inventory Items via RPC hack or assumptions...")

    // We can't query information_schema easily via Postgrest unless exposed.
    // Instead, let's just inspect the behavior by simulating an update.

    // 1. Create a dummy inventory item (or pick one)
    const { data: items } = await supabase.from('inventory_items').select('*').limit(1)
    if (!items || items.length === 0) return

    const item = items[0]
    const pid = item.product_id
    const qty = item.quantity

    console.log(`🧪 Test Item: ID=${item.id}, Qty=${qty}, Alloc=${item.allocated_quantity}`)

    // 2. Try to update allocated_quantity
    const { data: updated, error } = await supabase
        .from('inventory_items')
        .update({ allocated_quantity: qty })
        .eq('id', item.id)
        .select()
        .single()

    if (error) {
        console.log("❌ Update Failed:", error.message)
    } else {
        console.log(`✅ Update Success. Alloc is now: ${updated.allocated_quantity}`)
        // Revert 
        await supabase.from('inventory_items').update({ allocated_quantity: 0 }).eq('id', item.id)
    }
}
run()
