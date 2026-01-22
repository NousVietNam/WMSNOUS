import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
    try {
        const { jobId } = await req.json()

        if (!jobId) {
            return NextResponse.json({ error: 'Missing jobId' }, { status: 400 })
        }

        const supabaseAdmin = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!,
            { auth: { persistSession: false } }
        )

        // 1. Fetch Job and Tasks
        const { data: job, error: jobError } = await supabaseAdmin
            .from('picking_jobs')
            .select(`
                *,
                tasks:picking_tasks(*)
            `)
            .eq('id', jobId)
            .single()

        if (jobError || !job) {
            return NextResponse.json({ error: 'Job not found' }, { status: 404 })
        }

        // 1b. Validation: Only allow delete if PENDING or OPEN
        if (['IN_PROGRESS', 'COMPLETED', 'PICKED'].includes(job.status)) {
            return NextResponse.json({ error: 'Không thể xóa công việc đã bắt đầu hoặc hoàn thành.' }, { status: 400 })
        }

        // 2. Revert Inventory Allocation
        // NOTE: Database Trigger 'tr_picking_allocation' handles the actual stock reversion on delete.
        // Brain Rule: We do NOT log RELEASE transactions here because deleting a job only moves the order back to ALLOCATED.
        // Transations are only logged during Phân bổ (RESERVE) and Hủy phân bổ (RELEASE).

        // 4. Revert Outbound Order Status (Unified Schema)
        if (job.outbound_order_id) {
            // For PLANNED jobs, reset outbound_order status back to APPROVED
            // This is equivalent to "Cancel Allocation" button
            const { error: updateError } = await supabaseAdmin
                .from('outbound_orders')
                .update({
                    status: 'ALLOCATED',
                    allocated_at: null
                })
                .eq('id', job.outbound_order_id)

            if (updateError) {
                console.error("Failed to revert outbound order status:", updateError)
            }
        }

        // 5. Delete Job (Cascade will delete tasks)
        const { error: deleteError } = await supabaseAdmin
            .from('picking_jobs')
            .delete()
            .eq('id', jobId)

        if (deleteError) throw deleteError

        return NextResponse.json({ success: true })

    } catch (error: any) {
        console.error("Delete Job Error:", error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
