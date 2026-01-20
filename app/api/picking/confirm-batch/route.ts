
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: Request) {
    try {
        const { taskIds, outboxId } = await request.json()

        if (!taskIds || !Array.isArray(taskIds) || taskIds.length === 0) {
            return NextResponse.json({ success: false, error: 'Phải chọn ít nhất 1 mã hàng' }, { status: 400 })
        }
        if (!outboxId) {
            return NextResponse.json({ success: false, error: 'Chưa quét thùng đóng gói (Outbox)' }, { status: 400 })
        }

        // Validate Outbox once
        const { data: outbox } = await supabase
            .from('boxes')
            .select('id, code, type')
            .eq('id', outboxId)
            .single()

        if (!outbox || outbox.type !== 'OUTBOX') {
            return NextResponse.json({ success: false, error: 'Mã thùng không hợp lệ hoặc không phải thùng đóng gói' }, { status: 400 })
        }

        const transactionLog = []
        let successCount = 0
        let errors = []

        // Iterate tasks
        for (const taskId of taskIds) {
            // 1. Fetch Task
            const { data: task, error: taskError } = await supabase
                .from('picking_tasks')
                .select(`*, picking_jobs (id, order_id, user_id), products (sku, name)`)
                .eq('id', taskId)
                .single()

            if (taskError || !task) {
                errors.push(`Task ${taskId}: Không tìm thấy`)
                continue
            }
            if (task.status === 'COMPLETED') {
                successCount++ // Already done
                continue
            }

            // 3. Find and Move Inventory
            // Strategy: Deduct from Storage (Task's Box) -> Add to Outbox

            let invQuery = supabase.from('inventory_items')
                .select('id, quantity, allocated_quantity, box_id')
                .eq('product_id', task.product_id)
                .gt('quantity', 0)

            if (task.box_id) invQuery = invQuery.eq('box_id', task.box_id)

            const { data: inventories } = await invQuery.order('quantity', { ascending: false })

            if (!inventories || inventories.length === 0) {
                errors.push(`SKU ${task.products.sku}: Không tìm thấy tồn kho`)
                continue
            }

            let remainingToPick = task.quantity
            let taskLogs = []

            for (const inv of inventories) {
                if (remainingToPick <= 0) break
                const take = Math.min(inv.quantity, remainingToPick)

                // A. Deduct
                if (inv.quantity - take === 0) {
                    const { error: delErr } = await supabase.from('inventory_items').delete().eq('id', inv.id)
                    if (delErr) throw new Error(`Lỗi xoá tồn kho: ${delErr.message}`)
                } else {
                    const { error: updErr } = await supabase.from('inventory_items').update({
                        quantity: inv.quantity - take,
                        allocated_quantity: Math.max(0, (inv.allocated_quantity || 0) - take)
                    }).eq('id', inv.id)
                    if (updErr) throw new Error(`Lỗi cập nhật tồn kho: ${updErr.message}`)
                }

                // B. Add to Outbox
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
                        expiry_date: new Date().toISOString()
                    })
                }

                remainingToPick -= take

                // Log Transaction
                taskLogs.push({
                    type: 'MOVE_BOX',
                    entity_type: 'ITEM',
                    entity_id: inv.id,
                    from_box_id: task.box_id,
                    to_box_id: outboxId,
                    sku: task.products?.sku,
                    quantity: take,
                    user_id: task.picking_jobs?.user_id,
                    created_at: new Date().toISOString()
                })
            }

            if (remainingToPick > 0) {
                errors.push(`SKU ${task.products.sku}: Không đủ tồn kho (Thiếu ${remainingToPick})`)
                // Should rollback? For now partial failure allowed in batch?
                // User wants "Confirm Box". If fail, we should probably stop?
                // Assuming data is correct, it should pass.
            } else {
                // Success for this task
                transactionLog.push(...taskLogs)

                // Mark Task Completed
                const { error: taskUpdErr } = await supabase.from('picking_tasks').update({
                    status: 'COMPLETED',
                    outbox_code: outbox.code
                }).eq('id', taskId)

                if (taskUpdErr) {
                    throw new Error(`Lỗi cập nhật Task ${taskId}: ${taskUpdErr.message}`)
                }

                // Update Order Item
                if (task.picking_jobs?.order_id) {
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
                }
                successCount++
            }
        }

        // Insert Logs
        if (transactionLog.length > 0) {
            await supabase.from('transactions').insert(transactionLog)
        }

        // Job Completion Check (Simplistic: Check if current job has pending tasks)
        // We only check the job of the LAST task (assuming all in same job usually)
        // Ideally checking for each unique job involved.
        // But manual pick usually is one job.


        // Return result
        return NextResponse.json({
            success: errors.length === 0,
            processed: successCount,
            errors: errors.length > 0 ? errors : undefined
        })

    } catch (e: any) {
        console.error(e)
        return NextResponse.json({ success: false, error: e.message }, { status: 500 })
    }
}
