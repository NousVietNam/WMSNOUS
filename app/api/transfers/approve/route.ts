import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
    try {
        const { transferId, userId } = await req.json()

        if (!transferId) {
            return NextResponse.json({ error: 'Missing transferId' }, { status: 400 })
        }

        // Initialize Supabase Admin Client
        const supabaseAdmin = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!,
            {
                auth: {
                    autoRefreshToken: false,
                    persistSession: false
                }
            }
        )

        // 0. Fetch Default 'RETAIL' Warehouse ID
        const { data: retailWh } = await supabaseAdmin
            .from('warehouses')
            .select('id')
            .eq('code', 'RETAIL')
            .single()

        const defaultWarehouseId = retailWh?.id

        // 1. Get Transfer Order...
        const { data: order, error: orderError } = await supabaseAdmin
            .from('transfer_orders')
            .select(`
                *,
                items: transfer_order_items(
                    *,
                    product: products(sku)
                ),
                destination: destinations(*)
            `)
            .eq('id', transferId)
            .single()

        if (orderError || !order) {
            return NextResponse.json({ success: false, error: 'Order not found' }, { status: 404 })
        }

        if (order.status !== 'pending') {
            return NextResponse.json({ success: false, error: 'Order is not pending' }, { status: 400 })
        }

        // 2. Determine Transaction Type
        let transactionType = 'RESERVE'

        // 3. Prepare Transactions
        let transactions = []

        if (order.transfer_type === 'BOX') {
            // For Box Transfer
            const boxIds = order.items.map((i: any) => i.box_id).filter(Boolean)

            if (boxIds.length > 0) {
                const { data: boxItems, error: boxError } = await supabaseAdmin
                    .from('inventory_items')
                    .select('*, product:products(sku)')
                    .in('box_id', boxIds)

                if (boxError) throw boxError

                if (boxItems) {
                    transactions = boxItems.map((invItem: any) => ({
                        type: transactionType,
                        sku: invItem.product?.sku,
                        quantity: -invItem.quantity,
                        from_location_id: order.from_location_id,
                        warehouse_id: invItem.warehouse_id || defaultWarehouseId,
                        user_id: userId, // Add user_id
                        reference_id: order.id,
                        reference_code: order.code,
                        note: `Giữ hàng (Thùng) cho: ${order.destination?.name || 'Unknown'}`,
                        created_at: new Date().toISOString()
                    }))
                }
            }
        } else {
            // For Item Transfer
            transactions = order.items.map((item: any) => ({
                type: transactionType,
                sku: item.product?.sku,
                quantity: -item.quantity,
                from_location_id: order.from_location_id,
                warehouse_id: defaultWarehouseId, // Default to Retail for Item transfers
                user_id: userId, // Add user_id
                reference_id: order.id,
                reference_code: order.code,
                note: `Giữ hàng (Lẻ) cho: ${order.destination?.name || 'Unknown'}`,
                created_at: new Date().toISOString()
            }))
        }

        // 4. Update Order Status
        const { error: updateError, data: updatedOrder } = await supabaseAdmin
            .from('transfer_orders')
            .update({
                status: 'approved',
                // approved_by: ... // Skip for now as we don't have user context in Service Role easily without passing it
                updated_at: new Date().toISOString()
            })
            .eq('id', transferId)
            .select()

        console.log("Update Status Result:", { success: !updateError, error: updateError, data: updatedOrder })

        if (updateError) throw updateError

        // 5. Insert Transactions
        if (transactions.length > 0) {
            const { error: txError } = await supabaseAdmin.from('transactions').insert(transactions)
            if (txError) {
                console.error("Transaction Log Error:", txError)
                throw new Error("Ghi log giao dịch thất bại: " + txError.message)
            }
        }

        return NextResponse.json({ success: true, transactionType })

    } catch (error: any) {
        console.error("Approve Error:", error)
        return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }
}
