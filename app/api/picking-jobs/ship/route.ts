import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: Request) {
    try {
        const { jobId } = await request.json()

        if (!jobId) {
            return NextResponse.json({ success: false, error: 'Thiếu jobId' }, { status: 400 })
        }

        // Call RPC for Atomic Transaction
        const { data, error } = await supabase.rpc('ship_manual_job', { p_job_id: jobId })

        if (error) throw error

        if (!data.success) {
            return NextResponse.json({ success: false, error: data.error }, { status: 400 })
        }

        return NextResponse.json({
            success: true,
            message: data.message
        })

    } catch (e: any) {
        console.error("Manual Ship Error:", e)
        return NextResponse.json({ success: false, error: e.message }, { status: 500 })
    }
}
