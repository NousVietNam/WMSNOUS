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

        // 2. Revert Inventory Allocation (Only for ITEM_PICK)
        const transactions = []

        // Determine if we should log RELEASE transaction
        // For Transfers: NO (because they go back to APPROVED state which still Holds stock)
        // For Orders: YES (because they go back to PENDING/Open state)
        const shouldLogTransaction = !!job.order_id

        if ((job.type === 'ITEM_PICK' || job.type === 'MANUAL_PICK') && job.tasks && job.tasks.length > 0) {
            console.log(`[DeleteJob] Reverting allocation for ${job.tasks.length} tasks`)

            for (const task of job.tasks) {
                if (task.inventory_item_id && task.quantity > 0) {
                    // a. Fetch current allocation
                    const { data: invItem } = await supabaseAdmin
                        .from('inventory_items')
                        .select('id, allocated_quantity, product_id, location_id')
                        .eq('id', task.inventory_item_id)
                        .single()

                    if (invItem) {
                        // b. Decrease allocation
                        const newAllocated = Math.max(0, (invItem.allocated_quantity || 0) - task.quantity)

                        const { error: updateError } = await supabaseAdmin
                            .from('inventory_items')
                            .update({ allocated_quantity: newAllocated })
                            .eq('id', invItem.id)

                        if (updateError) {
                            console.error(`[DeleteJob] Failed to revert inventory ${invItem.id}:`, updateError)
                        } else if (shouldLogTransaction) {
                            // c. Prepare RELEASE Transaction Log matches user request for Sales Orders
                            transactions.push({
                                type: 'RELEASE',
                                sku: null,
                                quantity: task.quantity,
                                location_id: invItem.location_id,
                                reference_id: job.id,
                                note: `Hủy Picking Job: ${job.type}`,
                                created_at: new Date().toISOString()
                            })
                        }
                    }
                }
            }
        } else if (job.type === 'BOX_PICK' && shouldLogTransaction) {
            transactions.push({
                type: 'RELEASE',
                quantity: 1,
                reference_id: job.id,
                note: `Hủy Picking Job (Box): ${job.box_id || 'Unknown'}`,
                created_at: new Date().toISOString()
            })
        }

        // 3. Insert RELEASE Transactions (Audit Log) - Only for Sales Orders
        if (transactions.length > 0) {
            const { error: txError } = await supabaseAdmin.from('transactions').insert(transactions)
            if (txError) {
                console.error("Tx Log Error:", txError)
            }
        }

        // 4. Revert Order/Transfer Status
        if (job.transfer_order_id) {
            // Check if there are other ACTIVE jobs for this transfer
            const { count } = await supabaseAdmin
                .from('picking_jobs')
                .select('id', { count: 'exact', head: true })
                .eq('transfer_order_id', job.transfer_order_id)
                .neq('id', jobId) // Exclude current job
                .neq('status', 'CANCELLED')

            console.log(`[DeleteJob] Transfer ${job.transfer_order_id} has ${count} other active jobs`)

            if (count === 0) {
                // If this was the last job, revert to 'approved' (Ready to Allocate)
                const { error: updateError } = await supabaseAdmin
                    .from('transfer_orders')
                    .update({ status: 'approved' })
                    .eq('id', job.transfer_order_id)

                if (updateError) console.error("Failed to revert transfer status:", updateError)
                else console.log(`[DeleteJob] Reverted Transfer ${job.transfer_order_id} to 'approved'`)
            }
        } else if (job.order_id) {
            // Revert Sales Order
            // We also need to decrease 'allocated_quantity' on 'order_items'
            if (job.tasks && job.tasks.length > 0) {
                for (const task of job.tasks) {
                    // Find order item for this product
                    const { data: orderItems } = await supabaseAdmin
                        .from('order_items')
                        .select('id, allocated_quantity, quantity')
                        .eq('order_id', job.order_id)
                        .eq('product_id', task.product_id)

                    if (orderItems && orderItems.length > 0) {
                        let remainingRevert = task.quantity
                        for (const oi of orderItems) {
                            if (remainingRevert <= 0) break
                            const canRevert = Math.min(remainingRevert, oi.allocated_quantity || 0)
                            if (canRevert > 0) {
                                await supabaseAdmin
                                    .from('order_items')
                                    .update({ allocated_quantity: (oi.allocated_quantity || 0) - canRevert })
                                    .eq('id', oi.id)
                                remainingRevert -= canRevert
                            }
                        }
                    }
                }
            }

            await supabaseAdmin
                .from('orders')
                .update({ status: 'PENDING' })
                .eq('id', job.order_id)
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
