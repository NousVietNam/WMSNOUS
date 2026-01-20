
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
    console.log("🔍 Verifying Box Transfer relationships...")

    // 1. Find a recent BOX Transfer
    const { data: transfers } = await supabase
        .from('transfer_orders')
        .select(`
            id, code, status,
            transfer_order_items (
                id, box_id, quantity, boxes(code)
            )
        `)
        .eq('transfer_type', 'BOX')
        .order('created_at', { ascending: false })
        .limit(1)

    if (!transfers || transfers.length === 0) {
        console.log("❌ No Box Transfers found.")
        return
    }

    const transfer = transfers[0]
    console.log(`✅ Transfer: ${transfer.code} (${transfer.status})`)

    if (!transfer.transfer_order_items || transfer.transfer_order_items.length === 0) {
        console.log("❌ Transfer has no items.")
        return
    }

    const item = transfer.transfer_order_items[0]
    if (!item.box_id) {
        console.log("❌ Item has no box_id (Unexpected for Box Transfer).")
        return
    }

    console.log(`📦 Item Box: ${item.boxes?.code} (ID: ${item.box_id})`)

    // 2. Check Inventory for this Box
    const { data: inv, error } = await supabase
        .from('inventory_items')
        .select('*')
        .eq('box_id', item.box_id)

    if (error) {
        console.log("❌ Error fetching inventory:", error.message)
        return
    }

    if (inv && inv.length > 0) {
        console.log(`✅ Found ${inv.length} inventory items in this box:`)
        inv.forEach(i => {
            console.log(`   - InvID: ${i.id}`)
            console.log(`     Qty: ${i.quantity}`)
            console.log(`     Allocated: ${i.allocated_quantity}`)
            console.log(`     Updated At: ${i.updated_at}`) // Check validation
        })
    } else {
        console.log("⚠️ No inventory found for this Box ID! This explains why nothing was updated.")
        console.log("   Potential Cause: Box was created but inventory not linked or box is empty in system.")
    }
}
run()
