import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
    try {
        const { transferId, userId } = await req.json() // Read userId

        if (!transferId) {
            return NextResponse.json({ error: 'Missing transferId' }, { status: 400 })
        }
        // ...
        // Inside map
        const releaseTxs = reserveTxs.map(tx => ({
            type: 'RELEASE',
            sku: tx.sku,
            quantity: Math.abs(tx.quantity),
            from_location_id: tx.from_location_id,
            warehouse_id: tx.warehouse_id,
            user_id: userId, // Add user_id (who cancelled)
            reference_id: transferId,
            reference_code: order.code,
            note: `Hủy duyệt phiếu: ${order.code}`,
            created_at: new Date().toISOString()
        }))

        const supabaseAdmin = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!,
            { auth: { persistSession: false } }
        )

        // 1. Fetch Transfer Order
        const { data: order, error: orderError } = await supabaseAdmin
            .from('transfer_orders')
            .select('*')
            .eq('id', transferId)
            .single()

        if (orderError || !order) {
            return NextResponse.json({ error: 'Phiếu không tồn tại' }, { status: 404 })
        }

        if (order.status !== 'approved') {
            return NextResponse.json({ error: 'Chỉ có thể hủy duyệt phiếu đang ở trạng thái Cần Duyệt (Approved)' }, { status: 400 })
        }

        // 2. Lock Check: Ensure no Picking Jobs exist logic (Fail Safe)
        // Ideally UI handles this, but backend check is good.
        // But users might "Cancel Approval" even if picking jobs exist? No, Picking Jobs imply Allocation.
        // Status 'approved' means NO picking jobs (because picking jobs change status to 'allocated').
        // So this check is implicitly handled by status check.

        // 3. Find original RESERVE transactions
        const { data: reserveTxs, error: txError } = await supabaseAdmin
            .from('transactions')
            .select('*')
            .eq('reference_id', transferId)
            .eq('type', 'RESERVE')

        // 4. Create RELEASE transactions
        if (reserveTxs && reserveTxs.length > 0) {
            const releaseTxs = reserveTxs.map(tx => ({
                type: 'RELEASE',
                sku: tx.sku, // Revert to SKU
                quantity: Math.abs(tx.quantity),
                from_location_id: tx.from_location_id, // Use from_location_id
                warehouse_id: tx.warehouse_id, // Preserve Warehouse
                user_id: userId, // Add user_id
                reference_id: transferId,
                reference_code: order.code,
                note: `Hủy duyệt phiếu: ${order.code}`,
                created_at: new Date().toISOString()
            }))

            const { error: insertError } = await supabaseAdmin
                .from('transactions')
                .insert(releaseTxs)

            if (insertError) {
                console.error("Cancel Approve - Release Log Error:", insertError)
                // Continue anyway to unlock status? Best to throw error.
                throw new Error("Không thể ghi log hoàn trả: " + insertError.message)
            }
        }

        // 5. Update Status to 'pending'
        const { error: updateError } = await supabaseAdmin
            .from('transfer_orders')
            .update({
                status: 'pending',
                approved_by: null // Clear approval
            })
            .eq('id', transferId)

        if (updateError) throw updateError

        return NextResponse.json({ success: true, message: 'Đã hủy duyệt phiếu thành công' })

    } catch (error: any) {
        console.error("Cancel Approve Error:", error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
