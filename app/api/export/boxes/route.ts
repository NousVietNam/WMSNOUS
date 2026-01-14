// API Route - Export Boxes to Excel

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import * as XLSX from "xlsx"

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: NextRequest) {
    try {
        const { boxIds } = await request.json()

        if (!boxIds || boxIds.length === 0) {
            return NextResponse.json({ error: "Vui lòng chọn ít nhất 1 thùng" }, { status: 400 })
        }

        // Fetch inventory items for selected boxes
        const { data, error } = await supabase
            .from('inventory_items')
            .select('quantity, boxes(code), products(sku, name, barcode)')
            .in('box_id', boxIds)
            .gt('quantity', 0)

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 })
        }

        if (!data || data.length === 0) {
            return NextResponse.json({ error: "Không có sản phẩm nào trong các thùng đã chọn" }, { status: 404 })
        }

        // Create Excel data
        const exportData = data.map((row: any) => ({
            'Mã Thùng': row.boxes?.code,
            'SKU': row.products?.sku,
            'Barcode': row.products?.barcode,
            'Tên SP': row.products?.name,
            'Số Lượng': row.quantity
        }))

        // Generate Excel file
        const ws = XLSX.utils.json_to_sheet(exportData)
        const wb = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(wb, ws, "Packing_List")

        // Write to buffer
        const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' })

        const timestamp = new Date().toISOString().split('T')[0].replace(/-/g, '')
        const filename = `PackingList_Storage_${timestamp}.xlsx`

        // Return file as response
        return new NextResponse(buffer, {
            headers: {
                'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'Content-Disposition': `attachment; filename="${filename}"`,
            }
        })

    } catch (error: any) {
        console.error('Export error:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
