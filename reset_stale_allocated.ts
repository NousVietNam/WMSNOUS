import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function resetStaleAllocated() {
    console.log("=== RESETTING STALE ALLOCATED_QUANTITY ===")

    // Find items with allocated_quantity > 0 but no active picking tasks
    const { data: allocatedItems, error } = await supabase
        .from('inventory_items')
        .select('id, quantity, allocated_quantity, products(sku)')
        .gt('allocated_quantity', 0)

    if (error) {
        console.log("Error:", error.message)
        return
    }

    if (!allocatedItems || allocatedItems.length === 0) {
        console.log("No items with allocated_quantity > 0")
        return
    }

    console.log(`Found ${allocatedItems.length} items with allocated_quantity > 0`)

    for (const item of allocatedItems) {
        // Check if there are any active picking tasks for this item
        const { data: activeTasks } = await supabase
            .from('picking_tasks')
            .select('id')
            .eq('inventory_item_id', item.id)
            .neq('status', 'COMPLETED')

        if (!activeTasks || activeTasks.length === 0) {
            console.log(`  Resetting item ${item.id} (${(item as any).products?.sku}): allocated=${item.allocated_quantity} -> 0`)

            const { error: updateError } = await supabase
                .from('inventory_items')
                .update({ allocated_quantity: 0 })
                .eq('id', item.id)

            if (updateError) {
                console.log(`    Error: ${updateError.message}`)
            } else {
                console.log(`    ✅ Reset successful`)
            }
        } else {
            console.log(`  Keeping item ${item.id}: has ${activeTasks.length} active picking tasks`)
        }
    }

    console.log("\n=== DONE ===")
}

resetStaleAllocated().catch(console.error)
