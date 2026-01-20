import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function checkSchemaAndData() {
    // 1. Check a box
    const { data: boxes } = await supabase.from('boxes').select('*').limit(5)
    console.log("Sample Boxes:", boxes)

    // 2. Check Order ORD-142696
    const { data: order } = await supabase.from('orders').select('*, order_items(*)').eq('code', 'ORD-142696').single()
    console.log("Order ORD-142696:", order)

    // 3. Check for shortage
    if (order) {
        // Mocking the allocate logic briefly
        const items = order.order_items
        for (const item of items) {
            const { data: stock } = await supabase.from('inventory_items').select('quantity, allocated_quantity').eq('product_id', item.product_id)
            const total = stock?.reduce((acc, s) => acc + (s.quantity - (s.allocated_quantity || 0)), 0) || 0
            console.log(`Product ${item.product_id}: Required ${item.quantity}, Available ${total}`)
        }
    }
}

checkSchemaAndData()
