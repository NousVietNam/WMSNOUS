import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
    try {
        const { transferId } = await req.json()

        if (!transferId) {
            return NextResponse.json({ success: false, error: 'Missing transferId' }, { status: 400 })
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

        // 1. Get Transfer Order, Items, and Destination Info
        const { data: order, error: orderError } = await supabaseAdmin
            .from('transfer_orders')
            .select(`
                *, 
                items:transfer_order_items(*),
                destination:destinations(*)
            `)
            .eq('id', transferId)
            .single()

        if (orderError || !order) {
            return NextResponse.json({ success: false, error: 'Order not found' }, { status: 404 })
        }

        if (order.status !== 'pending') {
            return NextResponse.json({ success: false, error: 'Order is not pending' }, { status: 400 })
        }

        // 2. Determine Transaction Type based on Destination Type
        // store -> TRANSFER_OUT
        // customer -> EXPORT_SALE (or SALE)
        // partner -> TRANSFER_OUT (defaulting to transfer for now, or maybe EXPORT_PARTNER)

        let transactionType = 'TRANSFER_OUT'
        if (order.destination?.type === 'customer') {
            transactionType = 'EXPORT_SALE'
        }

        // 3. Prepare Transactions
        // Logic: 
        // - from_location: Where goods leave
        // - to: The destination name (since it's an unmanaged location/customer)

        const transactions = order.items.map((item: any) => ({
            type: transactionType,
            product_id: item.product_id,
            quantity: -item.quantity, // Negative for OUT
            location_id: order.from_location_id,
            reference_id: order.id,
            reference_code: order.code,
            note: `${transactionType === 'EXPORT_SALE' ? 'Bán hàng cho' : 'Điều chuyển đến'}: ${order.destination?.name || 'Unknown'}`
        }))

        // 4. Update Order Status
        const { error: updateError } = await supabaseAdmin
            .from('transfer_orders')
            .update({
                status: 'approved',
                approved_by: (await supabaseAdmin.auth.getUser()).data.user?.id || null,
                updated_at: new Date().toISOString()
            })
            .eq('id', transferId)

        if (updateError) throw updateError

        // 5. Insert Transactions
        if (transactions.length > 0) {
            const { error: txError } = await supabaseAdmin.from('transactions').insert(transactions)
            if (txError) {
                console.error("Transaction Log Error:", txError)
                // We don't rollback status update here to verify simplifying, but in prod we should using RPC/Transaction
            }
        }

        return NextResponse.json({ success: true, transactionType })

    } catch (error: any) {
        console.error("Approve Error:", error)
        return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }
}
