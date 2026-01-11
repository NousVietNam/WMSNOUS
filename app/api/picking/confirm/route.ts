import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function POST(request: Request) {
    try {
        const { taskId, outboxId } = await request.json()

        if (!taskId) return NextResponse.json({ success: false, error: 'Missing taskId' }, { status: 400 })
        if (!outboxId) return NextResponse.json({ success: false, error: 'Chưa quét thùng đóng gói (Outbox). Vui lòng quét thùng trước.' }, { status: 400 })

        // 1. Fetch Task Info
        const { data: task, error: taskError } = await supabase
            .from('picking_tasks')
            .select(`
                *, 
                picking_jobs (id, order_id, user_id),
                products (sku, name),
                boxes (code),
                locations (code)
            `)
            .eq('id', taskId)
            .single()

        if (taskError || !task) return NextResponse.json({ success: false, error: 'Task not found' })
        if (task.status === 'COMPLETED') return NextResponse.json({ success: false, error: 'Already completed' })

        // 2. Validate Outbox
        const { data: outbox } = await supabase
            .from('boxes')
            .select('id, code, type')
            .eq('id', outboxId)
            .single()

        if (!outbox || outbox.type !== 'OUTBOX') {
            return NextResponse.json({ success: false, error: 'Mã thùng không hợp lệ hoặc không phải thùng đóng gói' }, { status: 400 })
        }

        // 3. Find and Move Inventory
        // Strategy: 
        // - Deduct from Storage (Task's Box)
        // - Add to Outbox

        // Find best inventory match (Storage Box)
        let invQuery = supabase.from('inventory_items')
            .select('id, quantity, box_id')
            .eq('product_id', task.product_id)
            .gt('quantity', 0)

        if (task.box_id) invQuery = invQuery.eq('box_id', task.box_id)

        const { data: inventories } = await invQuery.order('quantity', { ascending: false })

        if (!inventories || inventories.length === 0) {
            return NextResponse.json({ success: false, error: 'Không tìm thấy tồn kho trong thùng gốc!' })
        }

        let remainingToPick = task.quantity
        const transactionLog = []

        for (const inv of inventories) {
            if (remainingToPick <= 0) break

            const take = Math.min(inv.quantity, remainingToPick)

            // A. Deduct from Storage
            if (inv.quantity - take === 0) {
                await supabase.from('inventory_items').delete().eq('id', inv.id)
            } else {
                await supabase.from('inventory_items').update({ quantity: inv.quantity - take }).eq('id', inv.id)
            }

            // B. Add to Outbox
            // Check if item already exists in Outbox to merge
            const { data: existingOutItem } = await supabase
                .from('inventory_items')
                .select('id, quantity')
                .eq('box_id', outboxId)
                .eq('product_id', task.product_id)
                .single()

            if (existingOutItem) {
                await supabase.from('inventory_items')
                    .update({ quantity: existingOutItem.quantity + take })
                    .eq('id', existingOutItem.id)
            } else {
                await supabase.from('inventory_items').insert({
                    box_id: outboxId,
                    product_id: task.product_id,
                    quantity: take,
                    expiry_date: new Date().toISOString() // Or copy from source if tracking
                })
            }

            remainingToPick -= take

            // Log Transaction (MOVE)
            transactionLog.push({
                type: 'MOVE', // Changed to 'MOVE' to match DB check constraint (presumably same as Transfer)
                entity_type: 'ITEM',
                entity_id: inv.id,
                from_box_id: task.box_id,
                to_box_id: outboxId,
                details: {
                    subtype: 'PACKING', // specific subtype
                    product_sku: task.products?.sku,
                    quantity: take,
                    from_box_code: task.boxes?.code || 'UNKNOWN',
                    to_outbox_code: outbox.code,
                    job_id: task.job_id
                },
                user_id: task.picking_jobs?.user_id,
                timestamp: new Date().toISOString()
            })
        }

        if (remainingToPick > 0) {
            return NextResponse.json({ success: false, error: 'Không đủ tồn kho để lấy đủ số lượng' })
        }

        // 4. Mark Task Completed
        await supabase.from('picking_tasks').update({ status: 'COMPLETED' }).eq('id', taskId)

        // 5. Update Order Item Picked Qty
        const { data: orderItem } = await supabase
            .from('order_items')
            .select('id, picked_quantity')
            .eq('order_id', task.picking_jobs.order_id)
            .eq('product_id', task.product_id)
            .single()

        if (orderItem) {
            await supabase.from('order_items')
                .update({ picked_quantity: (orderItem.picked_quantity || 0) + task.quantity })
                .eq('id', orderItem.id)
        }

        // 6. Log
        if (transactionLog.length > 0) {
            const { error: txError } = await supabase.from('transactions').insert(transactionLog)
            if (txError) {
                console.error("Transaction Error:", txError)
                // Return success but with warning, or fail?
                // Let's fail for now so user knows
                return NextResponse.json({ success: false, error: 'Transaction Log Failed: ' + txError.message })
            }
        }

        // 7. Check Job Completion
        const { count } = await supabase
            .from('picking_tasks')
            .select('*', { count: 'exact', head: true })
            .eq('job_id', task.job_id)
            .neq('status', 'COMPLETED')

        if (count === 0) {
            await supabase.from('picking_jobs').update({ status: 'COMPLETED' }).eq('id', task.job_id)

            // Allow Order Status update if all jobs done
            const { count: pendingJobs } = await supabase
                .from('picking_jobs')
                .select('*', { count: 'exact', head: true })
                .eq('order_id', task.picking_jobs.order_id)
                .neq('status', 'COMPLETED')

            if (pendingJobs === 0) {
                await supabase.from('orders').update({ status: 'COMPLETED' }).eq('id', task.picking_jobs.order_id)
            }
        }

        return NextResponse.json({ success: true })

    } catch (e: any) {
        console.error(e)
        return NextResponse.json({ success: false, error: e.message }, { status: 500 })
    }
}
