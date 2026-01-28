import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
    try {
        const body = await req.json()
        const { sourceBoxId, destinationBoxCode, inventoryItemIds, userId } = body

        if (!sourceBoxId || !destinationBoxCode || !inventoryItemIds || inventoryItemIds.length === 0) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
        }

        const supabaseAdmin = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!,
            { auth: { persistSession: false } }
        )

        // 1. Check if source box is allocated (has active picking jobs)
        const { data: pickingJobs } = await supabaseAdmin
            .from('picking_jobs')
            .select('id, status')
            .eq('box_id', sourceBoxId)
            .in('status', ['OPEN', 'IN_PROGRESS'])

        if (pickingJobs && pickingJobs.length > 0) {
            return NextResponse.json({
                error: 'BOX_ALLOCATED',
                message: 'Thùng này đang được phân bổ cho công việc soạn hàng. Không thể chuyển!'
            }, { status: 400 })
        }

        // 2. Find destination box by code
        const { data: destBox, error: destError } = await supabaseAdmin
            .from('boxes')
            .select('id, code, inventory_type')
            .eq('code', destinationBoxCode)
            .single()

        if (destError || !destBox) {
            return NextResponse.json({ error: 'Không tìm thấy thùng đích với mã: ' + destinationBoxCode }, { status: 404 })
        }

        if (destBox.id === sourceBoxId) {
            return NextResponse.json({ error: 'Thùng nguồn và thùng đích không thể giống nhau!' }, { status: 400 })
        }

        // 2b. Find source box
        const { data: srcBox, error: srcError } = await supabaseAdmin
            .from('boxes')
            .select('id, code, inventory_type')
            .eq('id', sourceBoxId)
            .single()

        if (srcError || !srcBox) {
            return NextResponse.json({ error: 'Không tìm thấy thùng nguồn' }, { status: 404 })
        }

        // 2c. Restriction: Only allow transfer between same inventory types
        const srcType = srcBox.inventory_type || 'PIECE'
        const destType = destBox.inventory_type || 'PIECE'

        if (srcType !== destType) {
            return NextResponse.json({
                error: 'TYPE_MISMATCH',
                message: `Chỉ có thể chuyển hàng giữa các thùng cùng loại! (Nguồn: ${srcType}, Đích: ${destType})`
            }, { status: 400 })
        }

        // 3. Verify all items belong to source box and get their type
        const { data: itemsToMove, error: itemsError } = await supabaseAdmin
            .from('view_box_contents_unified')
            .select('id, box_id, quantity, sku, inventory_source')
            .in('id', inventoryItemIds)

        if (itemsError) throw itemsError

        const invalidItems = itemsToMove?.filter(item => item.box_id !== sourceBoxId)
        if (invalidItems && invalidItems.length > 0) {
            return NextResponse.json({ error: 'Một số sản phẩm không thuộc thùng nguồn' }, { status: 400 })
        }

        // 4. Update items to new box based on their source (Piece or Bulk)
        const pieceIds = itemsToMove?.filter(i => i.inventory_source === 'PIECE').map(i => i.id) || []
        const bulkIds = itemsToMove?.filter(i => i.inventory_source === 'BULK').map(i => i.id) || []

        if (pieceIds.length > 0) {
            const { error: pErr } = await supabaseAdmin
                .from('inventory_items')
                .update({ box_id: destBox.id })
                .in('id', pieceIds)
            if (pErr) throw pErr
        }

        if (bulkIds.length > 0) {
            const { error: bErr } = await supabaseAdmin
                .from('bulk_inventory')
                .update({ box_id: destBox.id })
                .in('id', bulkIds)
            if (bErr) throw bErr
        }

        // 5. Create MOVE_BOX transactions for each item
        const transactions = itemsToMove?.map(item => ({
            type: 'MOVE_BOX',
            entity_type: 'ITEM',
            entity_id: item.id,
            quantity: item.quantity,
            from_box_id: sourceBoxId,
            to_box_id: destBox.id,
            sku: item.sku,
            user_id: userId || null,
            created_at: new Date().toISOString()
        })) || []

        if (transactions.length > 0) {
            const { error: txError } = await supabaseAdmin
                .from('transactions')
                .insert(transactions)

            if (txError) {
                console.error('Transaction log error:', txError)
            }
        }

        return NextResponse.json({
            success: true,
            movedCount: inventoryItemIds.length,
            destinationBox: destBox.code
        })

    } catch (error: any) {
        console.error('Transfer error:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
