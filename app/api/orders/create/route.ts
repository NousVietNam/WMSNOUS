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

            // A. Update Boxes: Link to Order and set status to LOCKED
            const { error: linkError } = await supabaseAdmin
                .from('boxes')
                .update({
                    order_id: order.id,
                    status: 'LOCKED'
                })
                .in('id', boxIds)

            if (linkError) throw linkError

            // B. Aggregate Items for Order Detail
            // Fetch all inventory in these boxes
            const { data: invItems } = await supabaseAdmin
                .from('inventory_items')
                .select('product_id, quantity')
                .in('box_id', boxIds)

            if (invItems) {
                // REVISION: Iterate Boxes First to keep box_id
                const itemsToInsert: any[] = []
                for (const box of boxes) {
                    // Get items for THIS box
                    const { data: bItems } = await supabaseAdmin
                        .from('inventory_items')
                        .select('product_id, quantity')
                        .eq('box_id', box.id)

                    if (bItems) {
                        bItems.forEach(i => {
                            // Only insert items with positive quantity
                            if (i.quantity && i.quantity > 0) {
                                itemsToInsert.push({
                                    order_id: order.id,
                                    product_id: i.product_id,
                                    quantity: i.quantity,
                                    picked_quantity: 0,
                                    box_id: box.id,
                                    is_box_line: true
                                })
                            }
                        })
                    }
                }

                if (itemsToInsert.length > 0) {
                    const { error: itemsError } = await supabaseAdmin
                        .from('order_items')
                        .insert(itemsToInsert)
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
