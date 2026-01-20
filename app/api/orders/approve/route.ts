import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: Request) {
    try {
        const { orderId, isApproved, userId } = await request.json();

        if (!orderId) return NextResponse.json({ success: false, error: 'Missing orderId' });

        // 1. Fetch full order info to create transaction logs
        const { data: order, error: fetchError } = await supabase
            .from('orders')
            .select(`
                *,
                order_items (
                    id, product_id, quantity,
                    products (sku, name)
                ),
                boxes (
                    id, code, location_id,
                    inventory_items (
                        product_id, quantity, warehouse_id, 
                        products (sku)
                    )
                )
            `)
            .eq('id', orderId)
            .single();

        if (fetchError || !order) throw new Error("Order not found");

        const supabaseAdmin = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!,
            { auth: { persistSession: false } }
        );

        if (isApproved) {
            // Check if RESERVE transactions already exist to prevent duplicates
            const { data: existingTx } = await supabaseAdmin
                .from('transactions')
                .select('id')
                .eq('reference_id', order.id)
                .eq('type', 'RESERVE')
                .limit(1)

            if (existingTx && existingTx.length > 0) {
                console.log(`RESERVE transactions already exist for order ${order.code}, skipping creation`)
            } else {
                let transactions = [];

                // SOURCE OF TRUTH: Use order_items which is a snapshot created at Order Creation time.
                // This ensures that even if the physical Box inventory changes, the Reservation remains consistent with the Order.
                if (order.order_items && order.order_items.length > 0) {
                    for (const item of order.order_items) {
                        transactions.push({
                            type: 'RESERVE',
                            sku: item.products?.sku || 'UNKNOWN',
                            quantity: item.quantity,
                            user_id: userId,
                            reference_id: order.id,
                            note: order.type === 'BOX'
                                ? `Giữ hàng (Thùng) cho đơn: ${order.code} - ${order.customer_name}`
                                : `Giữ hàng (Lẻ) cho đơn: ${order.code} - ${order.customer_name}`,
                            created_at: new Date().toISOString()
                        });
                    }
                }

                if (transactions.length > 0) {
                    const { error: txError } = await supabaseAdmin.from('transactions').insert(transactions);
                    if (txError) throw txError;
                }
            }
        }

        // 2. Update Approval Status
        const { error } = await supabase
            .from('orders')
            .update({
                is_approved: isApproved,
                approved_at: isApproved ? new Date().toISOString() : null,
                approved_by: isApproved ? userId : null
            })
            .eq('id', orderId);

        if (error) throw error;

        return NextResponse.json({ success: true });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message });
    }
}
