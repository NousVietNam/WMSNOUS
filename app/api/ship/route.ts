import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function POST(request: Request) {
    try {
        const { code } = await request.json()
        if (!code) return NextResponse.json({ success: false, error: 'Missing code' })

        // 1. Find Outbox
        const { data: box } = await supabase.from('boxes').select('id, code, type, order_id').eq('code', code).single()

        if (!box) return NextResponse.json({ success: false, error: 'Không tìm thấy thùng này' })
        if (box.type !== 'OUTBOX') return NextResponse.json({ success: false, error: 'Chỉ được phép xuất (Ship) thùng OUTBOX!' })

        // 2. Fetch Items
        const { data: items } = await supabase.from('inventory_items').select('*, products(sku)').eq('box_id', box.id)
        if (!items || items.length === 0) return NextResponse.json({ success: false, error: 'Thùng rỗng, không có gì để ship!' })

        // 3. Create Transactions (SHIP)
        const transactions = items.map(item => ({
            type: 'SHIP',
            entity_type: 'ITEM',
            entity_id: item.id, // ID will be gone, but we log it
            from_box_id: box.id,
            sku: item.products?.sku, // Fix: Populate top-level SKU
            quantity: item.quantity,
            // details: Removed
            created_at: new Date().toISOString()
        }))

        const { error: txError } = await supabase.from('transactions').insert(transactions)
        if (txError) throw txError

        // 4. Delete Inventory (Shipped away)
        const { error: delError } = await supabase.from('inventory_items').delete().eq('box_id', box.id)
        if (delError) throw delError

        // 5. Update Order Status (if linked) to SHIPPED or similar?
        // or just mark Box as Processed? 
        // For now, let's try to update Order if this is the last box? 
        // Keep simple: Update Box only if we support status on box?
        // Box doesn't have status column in schema shown earlier, but Order does.
        // Let's just update the Order linked to this box if possible.
        if (box.order_id) {
            // Check if Order is fully shipped
            // 1. Get all items in this order
            // 2. Compare picked vs shipped?
            // Simpler: Check if any "OUTBOX" for this order still has items?
            // Or better: calculated 'shipped_quantity' on order_items?
            // Let's rely on 'picked_quantity' vs 'shipped_quantity' if we track it.
            // Current schema has 'picked_quantity'. We probably need 'shipped_quantity' or check inventory.

            // Alternative: Check if any other boxes (OUTBOX) still exist for this order containing items?
            // If No other boxes -> SHIPPED.
            // Assumption: All picked items go to boxes blocked by 'OUTBOX' type.

            const { data: remainingBoxes } = await supabase
                .from('boxes')
                .select('id, inventory_items(count)')
                .eq('order_id', box.order_id)
                .neq('id', box.id) // Exclude current one (which is about to be empty/deleted?)
            // Wait, we just deleted items from this box above. 
            // We need to check if ANY box for this order still has inventory.

            // Check global inventory for this order?
            // Boxes are linked to order_id.

            // Let's count total items remaining in ALL boxes belonging to this order
            const { data: remainingItems } = await supabase
                .from('inventory_items')
                .select('id, boxes!inner(order_id)')
                .eq('boxes.order_id', box.order_id)
                .limit(1)

            if (!remainingItems || remainingItems.length === 0) {
                await supabase.from('orders').update({ status: 'SHIPPED' }).eq('id', box.order_id)
            } else {
                await supabase.from('orders').update({ status: 'PACKED' }).eq('id', box.order_id)
            }
        }

        return NextResponse.json({ success: true, count: items.length })

    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message })
    }
}
