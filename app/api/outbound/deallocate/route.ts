import { supabase } from '@/lib/supabase'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
    const { orderId } = await request.json()

    if (!orderId) {
        return NextResponse.json({ error: 'Missing orderId' }, { status: 400 })
    }

    try {
        // Check order status
        const { data: order, error: orderError } = await supabase
            .from('outbound_orders')
            .select('id, status')
            .eq('id', orderId)
            .single()

        if (orderError || !order) {
            return NextResponse.json({ error: 'Order not found' }, { status: 404 })
        }

        if (order.status !== 'ALLOCATED') {
            return NextResponse.json({ error: 'Chỉ có thể hủy phân bổ đơn ở trạng thái ALLOCATED' }, { status: 400 })
        }

        // Get picking jobs for this order
        const { data: jobs } = await supabase
            .from('picking_jobs')
            .select('id')
            .eq('outbound_order_id', orderId)
            .in('status', ['PLANNED', 'OPEN'])

        if (jobs && jobs.length > 0) {
            const jobIds = jobs.map(j => j.id)

            // Get tasks to release allocated quantities
            const { data: tasks } = await supabase
                .from('picking_tasks')
                .select('id, product_id, box_id, location_id, quantity')
                .in('job_id', jobIds)
                .eq('status', 'PENDING')

            // Release allocated_quantity for each task
            if (tasks && tasks.length > 0) {
                for (const task of tasks) {
                    // Find the inventory item
                    let query = supabase
                        .from('inventory_items')
                        .select('id, allocated_quantity')
                        .eq('product_id', task.product_id)

                    if (task.box_id) {
                        query = query.eq('box_id', task.box_id)
                    } else if (task.location_id) {
                        query = query.eq('location_id', task.location_id)
                    }

                    const { data: invItem } = await query.single()

                    if (invItem) {
                        // Decrease allocated_quantity
                        await supabase
                            .from('inventory_items')
                            .update({
                                allocated_quantity: Math.max(0, (invItem.allocated_quantity || 0) - task.quantity)
                            })
                            .eq('id', invItem.id)
                    }
                }
            }

            // Delete picking tasks
            await supabase
                .from('picking_tasks')
                .delete()
                .in('job_id', jobIds)

            // Delete picking jobs
            await supabase
                .from('picking_jobs')
                .delete()
                .in('id', jobIds)
        }

        // Update order status back to PENDING (but keep is_approved = true)
        await supabase
            .from('outbound_orders')
            .update({ status: 'PENDING' })
            .eq('id', orderId)

        return NextResponse.json({ success: true })
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
