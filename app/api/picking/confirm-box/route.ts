import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: Request) {
    try {
        const { boxId, jobId, userId } = await request.json()

        if (!boxId || !jobId) {
            return NextResponse.json({ success: false, error: 'Thiếu boxId hoặc jobId' }, { status: 400 })
        }

        const { data, error } = await supabase.rpc('confirm_box_pick', {
            p_box_id: boxId,
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
