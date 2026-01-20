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
                    .select('*, product:products(sku, name)')
                    .in('box_id', boxIds)

                if (boxError) throw boxError

                // VALIDATION: Check if any box item is already reserved
                const alreadyReserved = boxItems?.find((i: any) => i.allocated_quantity > 0)
                if (alreadyReserved) {
                    return NextResponse.json({
                        success: false,
                        error: `Thùng chứa sản phẩm đang bị giữ bởi đơn khác: ${alreadyReserved.product?.sku} (Đã giữ: ${alreadyReserved.allocated_quantity})`
                    }, { status: 400 })
                }

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
            // VALIDATION: Batch Check Availability Logic
            const productIds = order.items.map((i: any) => i.product_id)

            // 1. Single Query for all products
            const { data: allInvData, error: invError } = await supabaseAdmin
                .from('inventory_items')
                .select('product_id, quantity, allocated_quantity')
                .in('product_id', productIds)

            if (invError) throw invError

            // 2. Aggregate in Memory
            const inventoryMap: Record<string, { totalQty: number, totalAlloc: number }> = {}
            allInvData?.forEach((inv) => {
                if (!inventoryMap[inv.product_id]) {
                    inventoryMap[inv.product_id] = { totalQty: 0, totalAlloc: 0 }
                }
                inventoryMap[inv.product_id].totalQty += (inv.quantity || 0)
                inventoryMap[inv.product_id].totalAlloc += (inv.allocated_quantity || 0)
            })

            // 3. Validate
            for (const item of order.items) {
                const stats = inventoryMap[item.product_id] || { totalQty: 0, totalAlloc: 0 }
                const available = stats.totalQty - stats.totalAlloc

                if (item.quantity > available) {
                    return NextResponse.json({
                        success: false,
                        error: `Sản phẩm ${item.product?.sku} không đủ hàng khả dụng (Đặt: ${item.quantity}, Khả dụng: ${available})`
                    }, { status: 400 })
                }
            }

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
        const { error: updateError } = await supabaseAdmin
            .from('transfer_orders')
            .update({
                status: 'approved',
                // approved_by: ... // Skip for now as we don't have user context in Service Role easily without passing it
                updated_at: new Date().toISOString()
            })
            .eq('id', transferId)




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
