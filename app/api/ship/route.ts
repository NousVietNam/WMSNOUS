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
            timestamp: new Date().toISOString()
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
            await supabase.from('orders').update({ status: 'SHIPPED' }).eq('id', box.order_id)
        }

        return NextResponse.json({ success: true, count: items.length })

    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message })
    }
}
