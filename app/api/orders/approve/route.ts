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
            let transactions = [];

            // Logic: Create 'RESERVE' transactions (Negative Quantity)
            // Note: This logic mirrors Transfer Approve which creates transactions but doesn't auto-decrement inventory table rows (that happens at Allocate).
            // However, having these transactions allows for "Soft Reserve" calculation if implemented in search.

            if (order.type === 'BOX') {
                // For Box Orders, we reserve the specific items in those boxes
                if (order.boxes && order.boxes.length > 0) {
                    for (const box of order.boxes) {
                        if (box.inventory_items) {
                            for (const inv of box.inventory_items) {
                                transactions.push({
                                    type: 'RESERVE',
                                    sku: inv.products?.sku || 'UNKNOWN',
                                    quantity: inv.quantity,
                                    user_id: userId,
                                    reference_id: order.id,
                                    note: `Giữ hàng (Thùng) cho đơn: ${order.code} - ${order.customer_name}`,
                                    created_at: new Date().toISOString()
                                });
                            }
                        }
                    }
                }
            } else {
                // For Item Orders, we don't know the location/box yet (until Allocate).
                // So we create a "General" reservation at Warehouse level (or NULL location).
                if (order.order_items && order.order_items.length > 0) {
                    for (const item of order.order_items) {
                        transactions.push({
                            type: 'RESERVE',
                            sku: item.products?.sku || 'UNKNOWN',
                            quantity: item.quantity,
                            user_id: userId,
                            reference_id: order.id,
                            note: `Giữ hàng (Lẻ) cho đơn: ${order.code} - ${order.customer_name}`,
                            created_at: new Date().toISOString()
                        });
                    }
                }
            }

            if (transactions.length > 0) {
                const { error: txError } = await supabaseAdmin.from('transactions').insert(transactions);
                if (txError) throw txError;
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
