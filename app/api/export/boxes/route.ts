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

        // Query inventory_items (actual content) in selected boxes
        const { data: items, error } = await supabase
            .from('inventory_items')
            .select(`
                quantity,
                box_id,
                products (sku, name),
                boxes!inventory_items_box_id_fkey (code)
            `)
            .in('box_id', boxIds)

        if (error) throw error

        if (!items || items.length === 0) {
            return NextResponse.json({ error: 'Các thùng đã chọn không chứa hàng' }, { status: 404 })
        }

        // Build Excel rows
        const rows = items.map((item: any) => ({
            'Outbox': item.boxes?.code || '',
            'SKU': item.products?.sku || '',
            'Tên sản phẩm': item.products?.name || '',
            'Số lượng': item.quantity
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
