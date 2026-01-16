
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
    try {
        const { transferId } = await req.json()

        if (!transferId) {
            return NextResponse.json({ success: false, error: 'Missing transferId' }, { status: 400 })
        }

        const supabaseAdmin = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!,
            { auth: { persistSession: false } }
        )

        // 1. Update Picking Jobs (DRAFT -> OPEN)
        const { data: jobs, error: jobError } = await supabaseAdmin
            .from('picking_jobs')
            .update({ status: 'OPEN' })
            .eq('transfer_order_id', transferId)
            .eq('status', 'DRAFT')
            .select()

        if (jobError) throw jobError

        // 2. Update Transfer Order Status (if needed, e.g. to APPROVED or PROCESSING)
        // Let's set it to 'approved' if currently 'pending'
        await supabaseAdmin
            .from('transfer_orders')
            .update({ status: 'approved' })
            .eq('id', transferId)
            .eq('status', 'pending')

        return NextResponse.json({ success: true, count: jobs?.length || 0 })

    } catch (error: any) {
        console.error("Release Transfer Error:", error)
        return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }
}
