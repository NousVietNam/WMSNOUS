import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

interface UploadLine {
    boxCode: string
    sku: string
    quantity: number
}

export async function POST(req: NextRequest) {
    let jobId: string | undefined
    let tasks: any[] = []

    try {
        const { items } = await req.json() as { items: UploadLine[] }

        if (!items || items.length === 0) {
            return NextResponse.json({ success: false, error: 'No items provided' }, { status: 400 })
        }

        const supabaseAdmin = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!,
            { auth: { persistSession: false } }
        )

        // 1. Create Picking Job
        const { data: job, error: jobError } = await supabaseAdmin
            .from('picking_jobs')
            .insert({
                order_id: null,
                transfer_order_id: null,
                type: 'MANUAL_PICK',
                status: 'OPEN'
            })
            .select()
            .single()

        if (jobError || !job) {
            return NextResponse.json({ success: false, error: 'Failed to create job: ' + jobError?.message }, { status: 500 })
        }

        jobId = job.id
        const errors: string[] = []

        // 2. Process each line
        for (const line of items) {
            const { boxCode, sku, quantity } = line

            // 2a. Lookup box
            const { data: box } = await supabaseAdmin
                .from('boxes')
                .select('id, location_id')
                .eq('code', boxCode)
                .single()

            if (!box) {
                errors.push(`Box not found: ${boxCode}`)
                continue
            }

            // 2b. Validate Item
            // First, lookup product by SKU to get ID
            const { data: product } = await supabaseAdmin
                .from('products')
                .select('id')
                .eq('sku', sku)
                .single()

            if (!product) {
                errors.push(`SKU not found: ${sku}`)
                continue
            }

            // Then check if this product exists in the box
            const { data: invItem } = await supabaseAdmin
                .from('inventory_items')
                .select('id, product_id, quantity, allocated_quantity')
                .eq('box_id', box.id)
                .eq('product_id', product.id)
                .single()

            if (!invItem) {
                errors.push(`Item not in box: ${sku} @ ${boxCode}`)
                continue
            }

            // Check availability
            const available = invItem.quantity - (invItem.allocated_quantity || 0)
            if (quantity > available) {
                errors.push(`Not enough stock: ${sku} @ ${boxCode} (need ${quantity}, have ${available})`)
                continue
            }

            // Create task
            tasks.push({
                job_id: jobId,
                product_id: product.id,
                box_id: box.id,
                location_id: box.location_id,
                inventory_item_id: invItem.id,
                quantity: quantity,
                status: 'PENDING'
            })

            // Update allocated
            await supabaseAdmin
                .from('inventory_items')
                .update({ allocated_quantity: (invItem.allocated_quantity || 0) + quantity })
                .eq('id', invItem.id)
        }

        // 3. Insert tasks
        if (tasks.length === 0) {
            // Delete job if no tasks
            await supabaseAdmin.from('picking_jobs').delete().eq('id', jobId)
            return NextResponse.json({ success: false, error: 'No valid items to pick', errors }, { status: 400 })
        }

        console.log("Inserting tasks payload:", JSON.stringify(tasks, null, 2))

        const { error: taskError } = await supabaseAdmin.from('picking_tasks').insert(tasks)
        if (taskError) {
            console.error("Task Insert Error:", taskError)
            // Create rollback promises
            const rollbacks = tasks.map(async (t) => {
                // Fetch current alloc
                const { data: inv } = await supabaseAdmin
                    .from('inventory_items')
                    .select('allocated_quantity')
                    .eq('id', t.inventory_item_id)
                    .single()

                if (inv) {
                    await supabaseAdmin
                        .from('inventory_items')
                        .update({ allocated_quantity: Math.max(0, (inv.allocated_quantity || 0) - t.quantity) })
                        .eq('id', t.inventory_item_id)
                }
            })
            await Promise.all(rollbacks)

            // Rollback job
            await supabaseAdmin.from('picking_jobs').delete().eq('id', jobId)
            return NextResponse.json({ success: false, error: 'Failed to create tasks: ' + taskError.message }, { status: 500 })
        }

        return NextResponse.json({
            success: true,
            jobId,
            tasksCreated: tasks.length,
            errors: errors.length > 0 ? errors : undefined
        })

    } catch (error: any) {
        console.error('Upload Error:', error)

        // Try to rollback inventory if tasks were created in memory but failed somehow
        // (Note: Since we are in catch block, we might rely on 'tasks' array if it's accessible)
        // But main failure point is the task insertion block above.
        // If error happened inside the loop, 'tasks' would contain processed items. 
        // We should rollback them too.
        // However, loop error usually continues or breaks? 
        // My loop uses 'continue' on error, so it doesn't throw. 
        // Only unexpected errors throw.
        // Let's safe-guard rollback here too if jobId exists.

        // Only rollback if we have tasks and job created
        if (tasks.length > 0) {
            const supabaseAdmin = createClient( // Re-initialize if not in scope or needed
                process.env.NEXT_PUBLIC_SUPABASE_URL!,
                process.env.SUPABASE_SERVICE_ROLE_KEY!,
                { auth: { persistSession: false } }
            )
            const rollbacks = tasks.map(async (t) => {
                const { data: inv } = await supabaseAdmin
                    .from('inventory_items')
                    .select('allocated_quantity')
                    .eq('id', t.inventory_item_id)
                    .single()
                if (inv) {
                    await supabaseAdmin
                        .from('inventory_items')
                        .update({ allocated_quantity: Math.max(0, (inv.allocated_quantity || 0) - t.quantity) })
                        .eq('id', t.inventory_item_id)
                }
            })
            await Promise.all(rollbacks)
        }

        if (jobId) {
            const supabaseAdmin = createClient( // Re-initialize if not in scope or needed
                process.env.NEXT_PUBLIC_SUPABASE_URL!,
                process.env.SUPABASE_SERVICE_ROLE_KEY!,
                { auth: { persistSession: false } }
            )
            await supabaseAdmin.from('picking_jobs').delete().eq('id', jobId)
        }

        return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }
}
