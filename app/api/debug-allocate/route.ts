import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const code = searchParams.get('code');

        if (!code) return NextResponse.json({ error: 'Please provide ?code=ORDER-CODE' });

        const logs: string[] = [];
        const log = (msg: string, data?: any) => logs.push(`${msg} ${data ? JSON.stringify(data) : ''}`);

        log(`DEBUGGING ORDER: ${code}`);

        // 1. Get Order
        const { data: order } = await supabase.from('orders').select('id, status, is_approved').eq('code', code).single();
        if (!order) return NextResponse.json({ logs, error: 'Order not found' });
        log('Order Found', order);

        // 2. Get Items
        const { data: items } = await supabase.from('order_items').select('*').eq('order_id', order.id);
        log(`Items Found: ${items?.length}`, items);

        if (!items || items.length === 0) return NextResponse.json({ logs, error: 'No Items' });

        // 3. Simulate Allocation Calculation
        const demandMap: Record<string, number> = {};
        items.forEach(item => {
            const needed = item.quantity - (item.allocated_quantity || 0);
            if (needed > 0) demandMap[item.product_id] = needed;
        });
        const productIds = Object.keys(demandMap);
        log('Demand Map', demandMap);

        if (productIds.length === 0) return NextResponse.json({ logs, message: 'Fully Allocated Already' });

        // 4. Check Inventory
        const { data: inventory } = await supabase
            .from('inventory_items')
            .select('product_id, quantity, allocated_quantity, box_id')
            .in('product_id', productIds)
            .gt('quantity', 0);

        log(`Inventory Found: ${inventory?.length}`);

        // 5. Check Update Permissions (Dry Run)
        // Try to update the first item's allocated_quantity by 0 just to see if it errors
        const firstItem = items[0];
        log(`Test Updating Item ${firstItem.id} (Product ${firstItem.product_id})...`);

        const { data: updateData, error: updateError } = await supabase
            .from('order_items')
            .update({ allocated_quantity: firstItem.allocated_quantity }) // No change
            .eq('id', firstItem.id)
            .select();

        if (updateError) {
            log('❌ TEST UPDATE FAILED', updateError);
        } else {
            log('✅ Test Update Success', updateData);
        }

        return NextResponse.json({ success: true, logs });

    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message, stack: e.stack });
    }
}
