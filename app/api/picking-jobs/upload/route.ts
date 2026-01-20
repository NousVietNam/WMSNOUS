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
        const transactions: any[] = []

        // 2. Process each line
        items.forEach((line, index) => {
            const rowNum = index + 2 // Header is 1
            const { boxCode, sku, quantity } = line

            // 2a. Lookup box ... (We need to await in loop, so forEach is bad for async. Use for loop)
        })

        // Re-write loop with index
        for (let i = 0; i < items.length; i++) {
            const line = items[i]
            const rowNum = i + 2
            const { boxCode, sku, quantity } = line

            // 2a. Lookup box
            const { data: box } = await supabaseAdmin
                .from('boxes')
                .select('id, location_id')
                .eq('code', boxCode)
                .single()

            if (!box) {
                errors.push(`Dòng ${rowNum}: Không tìm thấy thùng '${boxCode}'`)
                continue
            }

            // 2b. Validate Item
            const { data: product } = await supabaseAdmin
                .from('products')
                .select('id')
                .eq('sku', sku)
                .single()

            if (!product) {
                errors.push(`Dòng ${rowNum}: Không tìm thấy SKU '${sku}'`)
                continue
            }

            // Check availability
            const { data: invItem } = await supabaseAdmin
                .from('inventory_items')
                .select('id, product_id, quantity, allocated_quantity')
                .eq('box_id', box.id)
                .eq('product_id', product.id)
                .single()

            if (!invItem) {
                errors.push(`Dòng ${rowNum}: Sản phẩm '${sku}' không có trong thùng '${boxCode}'`)
                continue
            }

            const available = invItem.quantity - (invItem.allocated_quantity || 0)
            if (quantity > available) {
                errors.push(`Dòng ${rowNum}: Không đủ tồn kho '${sku}' tại '${boxCode}' (Cần ${quantity}, Có ${available})`)
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

            // Create transaction (Audit log for Reservation)
            transactions.push({
                type: 'RESERVE',
                sku: sku,
                quantity: quantity,
                location_id: box.location_id || null,
                // Note: 'location_id' might be null in DB if box not assigned? Usually assigned.
                // But Typescript might complain if we don't handle undefined.
                // box.location_id comes from select('location_id').
                reference_id: jobId,
                note: `Upload Picking Job (Allocated)`,
                created_at: new Date().toISOString()
            })

            // REMOVED MANUAL ALLOC UPDATE
        }

        // 3. Insert tasks
        if (tasks.length === 0) {
            await supabaseAdmin.from('picking_jobs').delete().eq('id', jobId)
            return NextResponse.json({ success: false, error: 'Không có dòng nào hợp lệ', errors }, { status: 400 })
        }

        console.log("Inserting tasks payload:", tasks.length)

        // Fix double job_id key if strictly typing, but JS obj handles it.
        // Clean up task object
        const cleanTasks = tasks.map(({ job_id, ...rest }) => ({ job_id: jobId, ...rest }))

        const { error: taskError } = await supabaseAdmin.from('picking_tasks').insert(cleanTasks)

        if (taskError) {
            console.error("Task Insert Error:", taskError)
            // NO MANUAL ROLLBACK NEEDED (Trigger won't fire/commit if insert fails)
            // Just delete the empty job
            await supabaseAdmin.from('picking_jobs').delete().eq('id', jobId)
            return NextResponse.json({ success: false, error: 'Lỗi lưu database: ' + taskError.message }, { status: 500 })
        }

        // 4. Insert Transactions
        if (transactions.length > 0) {
            const { error: txError } = await supabaseAdmin.from('transactions').insert(transactions)
            if (txError) {
                console.error("Transaction Log Error:", txError)
                // We don't fail the request if logging fails, but it's good to note.
            }
        }

        return NextResponse.json({
            success: true,
            jobId,
            tasksCreated: tasks.length,
            errors: errors.length > 0 ? errors : undefined
        })

    } catch (error: any) {
        console.error('Upload Error:', error)
        if (jobId) {
            const supabaseAdmin = createClient(
                process.env.NEXT_PUBLIC_SUPABASE_URL!,
                process.env.SUPABASE_SERVICE_ROLE_KEY!,
                { auth: { persistSession: false } }
            )
            await supabaseAdmin.from('picking_jobs').delete().eq('id', jobId)
        }
        return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }
}
