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
            .select('id, code')
            .eq('code', destinationBoxCode)
            .single()

        if (destError || !destBox) {
            return NextResponse.json({ error: 'Không tìm thấy thùng đích với mã: ' + destinationBoxCode }, { status: 404 })
        }

        if (destBox.id === sourceBoxId) {
            return NextResponse.json({ error: 'Thùng nguồn và thùng đích không thể giống nhau!' }, { status: 400 })
        }

        // 3. Verify all inventory items belong to source box
        const { data: itemsToMove, error: itemsError } = await supabaseAdmin
            .from('inventory_items')
            .select('id, box_id, quantity, products(sku)')
            .in('id', inventoryItemIds)

        if (itemsError) throw itemsError

        const invalidItems = itemsToMove?.filter(item => item.box_id !== sourceBoxId)
        if (invalidItems && invalidItems.length > 0) {
            return NextResponse.json({ error: 'Một số sản phẩm không thuộc thùng nguồn' }, { status: 400 })
        }

        // 4. Update inventory items to new box
        const { error: updateError } = await supabaseAdmin
            .from('inventory_items')
            .update({ box_id: destBox.id })
            .in('id', inventoryItemIds)

        if (updateError) throw updateError

        // 5. Create MOVE_BOX transactions for each item
        const transactions = itemsToMove?.map(item => ({
            type: 'MOVE_BOX',
            entity_type: 'ITEM',
            entity_id: item.id,
            quantity: item.quantity,
            from_box_id: sourceBoxId,
            to_box_id: destBox.id,
            sku: (item as any).products?.sku,
            user_id: userId || null,
            created_at: new Date().toISOString()
        })) || []

        if (transactions.length > 0) {
            const { error: txError } = await supabaseAdmin
                .from('transactions')
                .insert(transactions)

            if (txError) {
                console.error('Transaction log error:', txError)
                // Don't fail the whole operation if logging fails
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
