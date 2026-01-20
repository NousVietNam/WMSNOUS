import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY! // Use service role for inventory deletion
)

export async function POST(request: Request) {
    try {
        const { code } = await request.json()
        if (!code) return NextResponse.json({ success: false, error: 'Missing code' })

        // 1. Find Box
        const { data: box, error: boxError } = await supabase
            .from('boxes')
            .select('*')
            .eq('code', code.toUpperCase())
            .single()

        if (boxError || !box) return NextResponse.json({ success: false, error: 'Không tìm thấy thùng này' })

        // 2. Fetch Inventory Items
        const { data: items } = await supabase
            .from('inventory_items')
            .select('*, products(sku)')
            .eq('box_id', box.id)

        if (!items || items.length === 0) return NextResponse.json({ success: false, error: 'Thùng rỗng, không có gì để ship!' })

        // 3. Create Transactions (SHIP)
        const transactions = items.map(item => ({
            type: 'SHIP',
            entity_type: 'ITEM',
            entity_id: item.id,
            from_box_id: box.id,
            sku: item.products?.sku,
            quantity: item.quantity,
            created_at: new Date().toISOString()
        }))

        const { error: txError } = await supabase.from('transactions').insert(transactions)
        if (txError) throw txError

        // 4. Delete Inventory (Shipped away)
        const { error: delError } = await supabase.from('inventory_items').delete().eq('box_id', box.id)
        if (delError) throw delError

        // 5. Update linked Document (Order or Transfer)
        const linkedId = box.order_id || box.transfer_order_id
        const orderIdField = box.order_id ? 'order_id' : 'transfer_order_id'
        const table = box.order_id ? 'orders' : 'transfer_orders'

        if (linkedId) {
            // Check if any other boxes for this order still have items
            const { data: remainingItems } = await supabase
                .from('inventory_items')
                .select('id, boxes!inner(id)')
                .eq(`boxes.${orderIdField}`, linkedId)
                .limit(1)

            if (!remainingItems || remainingItems.length === 0) {
                // No more items in any box -> Mark order as SHIPPED
                await supabase.from(table).update({
                    status: table === 'orders' ? 'SHIPPED' : 'shipped',
                    shipped_at: new Date().toISOString()
                }).eq('id', linkedId)
            }
        }

        // 6. Mark Box as SHIPPED (Optional status update)
        await supabase.from('boxes').update({ status: 'SHIPPED' }).eq('id', box.id)

        return NextResponse.json({ success: true, count: items.length })

    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message })
    }
}

