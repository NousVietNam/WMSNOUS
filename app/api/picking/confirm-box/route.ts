
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: Request) {
    try {
        const { jobId } = await request.json()

        if (!jobId) return NextResponse.json({ success: false, error: 'Missing jobId' }, { status: 400 })

        // 1. Fetch Job and Tasks
        const { data: job, error: jobError } = await supabase
            .from('picking_jobs')
            .select(`
                *,
                boxes (id, code),
                tasks:picking_tasks(*)
            `)
            .eq('id', jobId)
            .single()

        if (jobError || !job) return NextResponse.json({ success: false, error: 'Job not found' })
        if (job.status === 'COMPLETED') return NextResponse.json({ success: false, error: 'Job already completed' })

        // 2. Release Allocation & Complete Tasks
        // We need to iterate tasks to find inventory items and decrement allocated_quantity
        // Note: Tasks in create-from-boxes were linked to specific inventory items via box content logic, 
        // but `picking_tasks` table usually stores `product_id`.
        // My create-from-boxes stored `product_id`.
        // Inventory items have `product_id` and `box_id`.
        // So we can find the inventory item by (box_id, product_id).

        if (job.tasks && job.tasks.length > 0) {
            for (const task of job.tasks) {
                // Find inventory item
                const { data: invItem } = await supabase
                    .from('inventory_items')
                    .select('id, allocated_quantity')
                    .eq('box_id', job.box_id) // Task should match job box
                    .eq('product_id', task.product_id)
                    .single()

                if (invItem) {
                    // Decrement Allocated
                    const newAllocated = Math.max(0, (invItem.allocated_quantity || 0) - task.quantity)
                    await supabase.from('inventory_items')
                        .update({ allocated_quantity: newAllocated })
                        .eq('id', invItem.id)
                }

                // Complete Task
                await supabase.from('picking_tasks')
                    .update({ status: 'COMPLETED' })
                    .eq('id', task.id)
            }
        }

        // 3. Complete Job
        const { error: updateError } = await supabase
            .from('picking_jobs')
            .update({ status: 'COMPLETED' })
            .eq('id', jobId)

        if (updateError) throw updateError

        return NextResponse.json({ success: true })

    } catch (e: any) {
        console.error("Box Confirm Error:", e)
        return NextResponse.json({ success: false, error: e.message }, { status: 500 })
    }
}
