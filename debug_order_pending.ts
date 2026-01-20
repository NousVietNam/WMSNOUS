import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function debugOrder() {
    const code = 'ORD-142696'

    // 1. Fetch Order
    const { data: order } = await supabase
        .from('orders')
        .select('*')
        .eq('code', code)
        .single()

    if (!order) {
        console.log("Order not found")
        return
    }

    console.log("Order:", order)

    // 2. Fetch Order Items
    const { data: items } = await supabase
        .from('order_items')
        .select('*, products(sku)')
        .eq('order_id', order.id)

    console.log("Items:", items)

    // 3. Fetch Linked Boxes
    const { data: boxes } = await supabase
        .from('boxes')
        .select('*')
        .eq('order_id', order.id)

    console.log("Linked Boxes:", boxes)

    // 4. Fetch Inventory for these boxes
    if (boxes && boxes.length > 0) {
        const boxIds = boxes.map(b => b.id)
        const { data: inv } = await supabase
            .from('inventory_items')
            .select('*, products(sku)')
            .in('box_id', boxIds)
        console.log("Box Inventory:", inv)
    }

    // 5. Check for existing jobs
    const { data: jobs } = await supabase
        .from('picking_jobs')
        .select('*')
        .eq('order_id', order.id)
    console.log("Picking Jobs:", jobs)
}

debugOrder()
