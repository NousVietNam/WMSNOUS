import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function POST(request: Request) {
    try {
        const { code, jobId } = await request.json()

        if (!code || !jobId) return NextResponse.json({ success: false, error: 'Missing code or jobId' }, { status: 400 })

        // 1. Get Job & Order Info
        const { data: job, error: jobError } = await supabase
            .from('picking_jobs')
            .select('order_id')
            .eq('id', jobId)
            .single()

        if (jobError || !job) return NextResponse.json({ success: false, error: 'Job not found' }, { status: 404 })

        const orderId = job.order_id

        // 2. Validate Box
        const { data: box, error: boxError } = await supabase
            .from('boxes')
            .select('*')
            .eq('code', code)
            .single()

        if (boxError || !box) return NextResponse.json({ success: false, error: 'Mã thùng không tồn tại' }, { status: 404 })

        if (box.type !== 'OUTBOX') return NextResponse.json({ success: false, error: 'Đây không phải là thùng đóng gói (Outbox)' }, { status: 400 })

        // 3. Check Assignment
        if (box.order_id && box.order_id !== orderId) {
            return NextResponse.json({ success: false, error: 'Thùng này đang được dùng cho đơn hàng khác! Hãy chọn thùng khác.' }, { status: 409 })
        }

        // 4. Assign if needed
        if (!box.order_id) {
            await supabase.from('boxes').update({ order_id: orderId }).eq('id', box.id)
        }

        // 5. Update Order Status -> PICKING (if not already)
        await supabase.from('orders').update({ status: 'PICKING' }).eq('id', orderId).eq('status', 'ALLOCATED')

        return NextResponse.json({
            success: true,
            box: { id: box.id, code: box.code }
        })

    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message }, { status: 500 })
    }
}
