
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

const logFile = path.resolve(process.cwd(), 'debug_log.txt')
fs.writeFileSync(logFile, '') // Clear

function log(msg: string) {
    console.log(msg)
    fs.appendFileSync(logFile, msg + '\n')
}

// Replace console.log with log() in the rest of the file...
// Actually, easier to just override console.log helper or just replace usages.
// Let's just redefine log function and use it.

async function run() {
    log("🐞 Starting Deep Debug of Transfer Allocation...")

    // 1. Find a candidate Transfer (Approved but not Allocated, or just Approved)
    const { data: transfer, error: tfError } = await supabase
        .from('transfer_orders')
        .select(`*, transfer_order_items(*, products(sku))`)
        //.eq('status', 'approved') // Only test on approved ones
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

    if (!transfer) {
        log("⚠️ No transfers found to test.")
        return
    }

    log(`✅ Using Transfer: ${transfer.code} (ID: ${transfer.id}) Status: ${transfer.status}`)
    await debugAllocate(transfer)
}

async function debugAllocate(transfer: any) {
    const items = transfer.transfer_order_items
    if (!items || items.length === 0) {
        log("❌ Transfer has no items.")
        return
    }

    log(`📦 Transfer has ${items.length} items.`)
    items.forEach((i: any) => log(`   - Product: ${i.products?.sku} (ID: ${i.product_id}), Qty Needed: ${i.quantity}`))

    const productIds = items.map((i: any) => i.product_id)

    // Check Inventory
    log("🔎 Checking Inventory...")
    const { data: inventory, error: invError } = await supabase
        .from('inventory_items')
        .select('*')
        .in('product_id', productIds)
        .gt('quantity', 0)

    if (invError) {
        log("Error fetching inventory: " + invError.message)
        return
    }

    log(`   Found ${inventory?.length} inventory records for these products.`)
    inventory?.forEach((inv: any) => {
        const available = inv.quantity - (inv.allocated_quantity || 0)
        log(`   - InvID: ${inv.id}, Prod: ${inv.product_id}, Qty: ${inv.quantity}, Alloc: ${inv.allocated_quantity}, Avail: ${available}`)
    })

    // Simulate Allocation Logic
    log("🔄 Simulating Allocation Loop...")
    const newTasks: any[] = []

    // Simple map simulation
    const inventoryMap: any = {}
    inventory?.forEach((inv: any) => {
        if (!inventoryMap[inv.product_id]) inventoryMap[inv.product_id] = []
        inventoryMap[inv.product_id].push({ ...inv }) // Clone
    })

    for (const item of items) {
        const productInventory = inventoryMap[item.product_id] || []
        let remaining = item.quantity
        log(`   > Allocating for ${item.product_id}. Need: ${remaining}`)

        if (productInventory.length === 0) {
            log("     ❌ No Inventory found for this product.")
            continue
        }

        for (const inv of productInventory) {
            if (remaining <= 0) break
            const available = inv.quantity - (inv.allocated_quantity || 0)

            if (available <= 0) {
                log(`     - Skip Inv ${inv.id} (No availability: ${available})`)
                continue
            }

            const take = Math.min(remaining, available)
            log(`     ✅ Taking ${take} from Inv ${inv.id}`)

            newTasks.push({
                product_id: item.product_id,
                location_id: inv.location_id,
                quantity: take
            })

            inv.allocated_quantity += take
            remaining -= take
        }

        if (remaining > 0) log(`     ⚠️ SHORTAGE: Still need ${remaining}`)
    }

    log("📊 RESULT:")
    if (newTasks.length > 0) {
        log(`✅ Would create ${newTasks.length} tasks.`)
        // Check if there is already a picking job for this transfer
        const { data: existingJobs } = await supabase
            .from('picking_jobs')
            .select('id, picking_tasks(count)')
            .eq('transfer_order_id', transfer.id)

        if (existingJobs && existingJobs.length > 0) {
            log(`⚠️ Warning: Transfer already has ${existingJobs.length} Picking Jobs.`)
            existingJobs.forEach((j: any) => log(`   - Job ${j.id}: ${j.picking_tasks[0]?.count || 0} tasks`))
        } else {
            log("ℹ️ No existing jobs for this transfer.")
        }

    } else {
        log("❌ NO TASKS generated. Allocation failed due to logic or shortage.")
    }
}

run()
