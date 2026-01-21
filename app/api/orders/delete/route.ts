
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: Request) {
    try {
        const { orderId } = await req.json()

        if (!orderId) {
            return NextResponse.json({ success: false, error: 'Thiếu Order ID' })
        }

        const supabaseAdmin = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!,
            { auth: { persistSession: false } }
        )

        // 1. Check Status
        const { data: order, error: fetchError } = await supabaseAdmin
            .from('orders')
            .select('id, status, type')
            .eq('id', orderId)
            .single()

        if (fetchError || !order) {
            return NextResponse.json({ success: false, error: 'Không tìm thấy đơn hàng' })
        }

        if (order.status !== 'PENDING') {
            return NextResponse.json({ success: false, error: 'Chỉ có thể xóa đơn hàng ở trạng thái PENDING' })
        }

        // 2. Unlink Boxes (if existing)
        // Set order_id = NULL for boxes linked to this order
        const { error: boxError } = await supabaseAdmin
            .from('boxes')
            .update({ order_id: null, status: 'STORAGE' })
            .eq('order_id', orderId)

        if (boxError) throw boxError

        // 3. Delete Items
        const { error: itemError } = await supabaseAdmin
            .from('order_items')
            .delete()
            .eq('order_id', orderId)

        if (itemError) throw itemError

        // 4. Delete Order
        const { error: deleteError } = await supabaseAdmin
            .from('orders')
            .delete()
            .eq('id', orderId)

        if (deleteError) throw deleteError

        return NextResponse.json({ success: true, message: "Đã xóa đơn hàng thành công" })

    } catch (e: any) {
        console.error("Delete Order Error:", e)
        return NextResponse.json({ success: false, error: e.message }, { status: 500 })
    }
}
