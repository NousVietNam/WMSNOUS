
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: Request) {
    try {
        const { jobId, userId } = await request.json()

        if (!jobId) {
            return NextResponse.json({ success: false, error: 'Thiếu mã Job' }, { status: 400 })
        }

        // Call the RPC that handles all logic:
        // 1. Checks all tasks are completed
        // 2. Moves boxes to GATE-OUT
        // 3. Creates outbound_shipment (PXK)
        // 4. Updates Job and Order status
        const { data, error } = await supabase.rpc('complete_picking_job', {
            p_job_id: jobId,
            p_user_id: userId || null
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
