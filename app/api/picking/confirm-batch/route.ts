
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: Request) {
    try {
        const { taskIds, outboxId, userId } = await request.json()

        if (!taskIds || !Array.isArray(taskIds) || taskIds.length === 0) {
            return NextResponse.json({ success: false, error: 'Phải chọn ít nhất 1 mã hàng' }, { status: 400 })
        }
        if (!outboxId) {
            return NextResponse.json({ success: false, error: 'Chưa quét thùng đóng gói (Outbox)' }, { status: 400 })
        }

        // Call Optimized RPC


        const { data, error } = await supabase.rpc('confirm_picking_batch', {
            p_task_ids: taskIds,
            p_outbox_id: outboxId,
            p_user_id: userId || null // Use userId from client
        })

        if (error) {
            console.error("RPC Error:", error)
            return NextResponse.json({ success: false, error: error.message }, { status: 500 })
        }

        return NextResponse.json(data)

    } catch (e: any) {
        console.error(e)
        return NextResponse.json({ success: false, error: e.message }, { status: 500 })
    }
}
