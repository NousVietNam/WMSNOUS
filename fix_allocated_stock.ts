
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
    console.log("🔧 Starting Manual Fix for Box Allocation Stock...")

    // 1. Find ALL Allocated Box Transfers
    const { data: transfers } = await supabase
        .from('transfer_orders')
        .select(`
            id, code, 
            transfer_order_items (box_id)
        `)
        .eq('status', 'allocated')
        .eq('transfer_type', 'BOX')

    if (!transfers || transfers.length === 0) {
        console.log("✅ No Allocated Box Transfers found needing fix.")
        return
    }

    console.log(`found ${transfers.length} transfers.`)

    let totalUpdated = 0

    for (const tf of transfers) {
        if (!tf.transfer_order_items) continue

        const boxIds = tf.transfer_order_items.map((i: any) => i.box_id).filter(Boolean)

        if (boxIds.length === 0) continue

        console.log(`   Transfer ${tf.code}: checking ${boxIds.length} boxes...`)

        // Fetch Inventory
        const { data: invs } = await supabase
            .from('inventory_items')
            .select('*')
            .in('box_id', boxIds)

        if (!invs) continue

        for (const inv of invs) {
            // Logic: If allocated transfer, allocated_quantity should be equal to quantity (or at least > 0)
            if (inv.allocated_quantity !== inv.quantity) {
                console.log(`   👉 Fixing Inv ${inv.id} (Box ${inv.box_id}): ${inv.allocated_quantity} -> ${inv.quantity}`)

                const { error } = await supabase
                    .from('inventory_items')
                    .update({ allocated_quantity: inv.quantity })
                    .eq('id', inv.id)

                if (error) console.error("      ❌ Failed:", error.message)
                else totalUpdated++
            }
        }
    }

    console.log(`✅ Finished. Updated ${totalUpdated} inventory records.`)
}
run()
