
import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function inspectItemTasks() {
    const boxCode = 'BOX-TEST-0002'
    const sku = 'NB2S25-TB2-M04-OW-0M'
    console.log(`Inspecting tasks for ${sku} in ${boxCode}...`)

    // 1. Get Box
    const { data: box } = await supabase.from('boxes').select('id').eq('code', boxCode).single()
    if (!box) { console.log("Box not found"); return }

    // 2. Get Product
    const { data: product } = await supabase.from('products').select('id').eq('sku', sku).single()
    if (!product) { console.log("Product not found"); return }

    // 3. Get Inventory Item
    const { data: item } = await supabase
        .from('inventory_items')
        .select('id, quantity, allocated_quantity')
        .eq('box_id', box.id)
        .eq('product_id', product.id)
        .single()

    if (!item) { console.log("Item not found"); return }

    console.log(`Item ID: ${item.id}, Alloc: ${item.allocated_quantity}`)

    // 4. Get Tasks
    const { data: tasks } = await supabase
        .from('picking_tasks')
        .select('id, picking_job_id, status, quantity')
        .eq('inventory_item_id', item.id)

    if (!tasks || tasks.length === 0) {
        console.log("No tasks found for this item.")
        return
    }

    console.log(`Found ${tasks.length} tasks:`)
    for (const t of tasks) {
        // Check Job
        const { data: job } = await supabase
            .from('picking_jobs')
            .select('id, status, type')
            .eq('id', t.picking_job_id)
            .single()

        console.log(`- Task ${t.id}: Status=${t.status}, Qty=${t.quantity}`)
        if (job) {
            console.log(`  -> Linked to Job ${job.id} (${job.status}, ${job.type})`)
        } else {
            console.log(`  -> Linked to MISSING Job ${t.picking_job_id} (ORPHAN)`)
        }
    }
}

inspectItemTasks()
