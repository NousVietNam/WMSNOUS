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
        for (let i = 0; i < items.length; i++) {
            const line = items[i]
            const rowNum = i + 2
            const boxCode = line.boxCode?.trim()
            const sku = line.sku?.trim()
            const quantity = line.quantity

            if (!boxCode || !sku) {
                errors.push(`Dòng ${rowNum}: Thiếu mã thùng hoặc SKU`)
                continue
            }

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
            const { data: invItems } = await supabaseAdmin
                .from('inventory_items')
                .select('id, product_id, quantity, allocated_quantity, created_at')
                .eq('box_id', box.id)
                .eq('product_id', product.id)
                .order('created_at', { ascending: true }) // FIFO preference

            if (!invItems || invItems.length === 0) {
                errors.push(`Dòng ${rowNum}: Sản phẩm '${sku}' không có trong thùng '${boxCode}'`)
                continue
            }

            // Calculate total available
            const totalAvailable = invItems.reduce((sum, item) => sum + (item.quantity - (item.allocated_quantity || 0)), 0)

            if (quantity > totalAvailable) {
                errors.push(`Dòng ${rowNum}: Không đủ tồn kho '${sku}' tại '${boxCode}' (Cần ${quantity}, Có ${totalAvailable})`)
                continue
            }

            // Distribute quantity across inventory items
            let remaining = quantity

            for (const invItem of invItems) {
                if (remaining <= 0) break

                const available = invItem.quantity - (invItem.allocated_quantity || 0)
                if (available <= 0) continue

                const take = Math.min(remaining, available)

                // Create task for this portion
                tasks.push({
                    job_id: jobId,
                    product_id: product.id,
                    box_id: box.id,
                    location_id: box.location_id,
                    inventory_item_id: invItem.id,
                    quantity: take,
                    status: 'PENDING'
                })

                // Create transaction
                transactions.push({
                    type: 'RESERVE',
                    sku: sku,
                    quantity: take,
                    location_id: box.location_id || null,
                    reference_id: jobId,
                    note: `Upload Picking Job (Allocated)`,
                    created_at: new Date().toISOString()
                })

                remaining -= take
            }

            // REMOVED MANUAL ALLOC UPDATE
        }

        // 3. Insert tasks
        if (tasks.length === 0) {
            await supabaseAdmin.from('picking_jobs').delete().eq('id', jobId)
            return NextResponse.json({ success: false, error: 'Không có dòng nào hợp lệ', errors }, { status: 400 })
        }



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
