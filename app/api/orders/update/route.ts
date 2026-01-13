import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: Request) {
    try {
        const { orderId, items } = await request.json();

        if (!orderId || !items || !Array.isArray(items)) {
            return NextResponse.json({ success: false, error: 'Invalid data' });
        }

        // 1. Validate Order Status
        const { data: order } = await supabase.from('orders').select('status, is_approved').eq('id', orderId).single();
        if (!order) return NextResponse.json({ success: false, error: 'Order not found' });

        if (order.status !== 'PENDING') {
            return NextResponse.json({ success: false, error: 'Chỉ có thể sửa đơn hàng ở trạng thái PENDING' });
        }
        if (order.is_approved) {
            return NextResponse.json({ success: false, error: 'Phải bỏ duyệt đơn hàng trước khi sửa' });
        }

        // 2. Transaction: Delete Old -> Insert New
        // Supabase doesn't support transaction via JS client easily without RPC, 
        // but we can do sequential ops. If insert fails, we are in trouble.
        // For this MVP, sequential is acceptable.

        // Delete old items
        const { error: delError } = await supabase.from('order_items').delete().eq('order_id', orderId);
        if (delError) throw delError;

        // Insert new items
        // Filter valid items
        const validItems = items.filter((i: any) => i.product_id && i.quantity > 0).map((i: any) => ({
            order_id: orderId,
            product_id: i.product_id,
            quantity: i.quantity
        }));

        if (validItems.length > 0) {
            const { error: insError } = await supabase.from('order_items').insert(validItems);
            if (insError) throw insError;
        }

        return NextResponse.json({ success: true });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message });
    }
}
