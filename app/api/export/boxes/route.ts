import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import * as XLSX from 'xlsx'

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: Request) {
    try {
        const { boxIds } = await request.json()

        if (!boxIds || !Array.isArray(boxIds) || boxIds.length === 0) {
            return NextResponse.json({ error: 'Phải chọn ít nhất 1 thùng' }, { status: 400 })
        }

        // Fetch detailed data for selected outboxes via picking_tasks
        const { data: tasks, error } = await supabase
            .from('picking_tasks')
            .select(`
                quantity,
                products (sku, name),
                boxes!picking_tasks_box_id_fkey (code, id),
                picking_jobs (id, orders (code, customer_name))
            `)
            .eq('status', 'COMPLETED')
            .not('outbox_code', 'is', null)

        if (error) throw error

        // Get outbox codes from boxIds
        const { data: outboxes } = await supabase
            .from('boxes')
            .select('id, code')
            .in('id', boxIds)

        const outboxMap = new Map(outboxes?.map(b => [b.id, b.code]) || [])

        // Filter tasks by selected outboxes via outbox_code matching
        const filteredTasks = tasks?.filter(t => {
            // Find if this task's outbox_code matches any selected outbox
            const matchingOutbox = outboxes?.find(ob => {
                // Check via direct match if we stored outbox_code
                // Assuming outbox_code is the code string
                return t.outbox_code === ob.code ||
                    // Or try to infer from picking_tasks join if available
                    false // Need to adjust based on actual schema
            })
            return matchingOutbox
        }) || []

        // Actually, let's query by outbox_code directly since we have it
        // Re-query with outbox codes
        const outboxCodes = outboxes?.map(ob => ob.code) || []

        const { data: tasksByOutbox } = await supabase
            .from('picking_tasks')
            .select(`
                outbox_code,
                quantity,
                products (sku, name),
                boxes!picking_tasks_box_id_fkey (code),
                picking_jobs (id, orders (code, customer_name))
            `)
            .in('outbox_code', outboxCodes)
            .eq('status', 'COMPLETED')

        if (!tasksByOutbox || tasksByOutbox.length === 0) {
            return NextResponse.json({ error: 'Không có dữ liệu để xuất' }, { status: 404 })
        }

        // Build Excel rows
        const rows = tasksByOutbox.map((task: any) => ({
            'Outbox': task.outbox_code,
            'SKU': task.products?.sku || '',
            'Tên sản phẩm': task.products?.name || '',
            'Số lượng': task.quantity,
            'Thùng nguồn': task.boxes?.code || '',
            'Đơn hàng': task.picking_jobs?.orders?.code || '',
            'Khách hàng': task.picking_jobs?.orders?.customer_name || ''
        }))

        // Create workbook
        const worksheet = XLSX.utils.json_to_sheet(rows)
        const workbook = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Outboxes')

        // Generate buffer
        const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })

        // Return as file
        return new NextResponse(buffer, {
            headers: {
                'Content-Disposition': `attachment; filename="Outboxes_${new Date().toISOString().split('T')[0]}.xlsx"`,
                'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            },
        })

    } catch (e: any) {
        console.error(e)
        return NextResponse.json({ error: e.message }, { status: 500 })
    }
}
