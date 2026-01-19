import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: Request) {
    try {
        const { code, customerName, note, type, items, boxes } = await req.json()

        if (!code || !customerName) {
            return NextResponse.json({ success: false, error: 'Thiếu thông tin bắt buộc' })
        }

        const supabaseAdmin = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!,
            { auth: { persistSession: false } }
        )

        // 1. Create Order
        const { data: order, error: orderError } = await supabaseAdmin
            .from('orders')
            .insert({
                code,
                customer_name: customerName,
                status: 'PENDING',
                type: type || 'ITEM', // Fix: Save order type to DB
                note: note || null
            })
            .select()
            .single()

        if (orderError) throw orderError

        // 2. Handle Items/Boxes
        if (type === 'BOX' && boxes && boxes.length > 0) {
            const boxIds = boxes.map((b: any) => b.id)

            // A. Update Boxes: Link to Order
            const { error: linkError } = await supabaseAdmin
                .from('boxes')
                .update({ order_id: order.id })
                .in('id', boxIds)

            if (linkError) throw linkError

            // B. Aggregate Items for Order Detail
            // Fetch all inventory in these boxes
            const { data: invItems } = await supabaseAdmin
                .from('inventory_items')
                .select('product_id, quantity')
                .in('box_id', boxIds)

            if (invItems) {
                const productMap = new Map<string, number>()
                invItems.forEach(item => {
                    productMap.set(item.product_id, (productMap.get(item.product_id) || 0) + item.quantity)
                })

                const orderItems = Array.from(productMap.entries()).map(([pid, qty]) => ({
                    order_id: order.id,
                    product_id: pid,
                    quantity: qty,
                    picked_quantity: 0
                }))

                if (orderItems.length > 0) {
                    const { error: itemsError } = await supabaseAdmin
                        .from('order_items')
                        .insert(orderItems)
                    if (itemsError) throw itemsError
                }
            }

        } else if (type === 'ITEM' && items && items.length > 0) {
            const orderItems = items.map((item: any) => ({
                order_id: order.id,
                product_id: item.id,
                quantity: item.quantity,
                picked_quantity: 0
            }))

            const { error: itemsError } = await supabaseAdmin
                .from('order_items')
                .insert(orderItems)
            if (itemsError) throw itemsError
        }

        return NextResponse.json({ success: true, orderId: order.id })

    } catch (e: any) {
        console.error("Create Order Error:", e)
        return NextResponse.json({ success: false, error: e.message }, { status: 500 })
    }
}
