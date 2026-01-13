import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY! // Use SC to bypass RLS for seeding
);

export async function POST() {
    try {
        // 1. Fetch ALL Products (id, sku)
        // No limit, or high limit to ensure variety
        const { data: products, error: prodError } = await supabase
            .from('products')
            .select('id, sku')
            .limit(2000); // Fetch up to 2000 products for variety

        if (prodError || !products || products.length === 0) {
            return NextResponse.json({ success: false, error: 'No products found' });
        }

        // 2. Fetch Locations for Inventory Checking (optional, to smart seed)
        // Actually, let's just use random logic:
        // 70% chance: Quantity <= Available (Sufficient)
        // 30% chance: Quantity > Available (Shortage)

        // But to do that accurately, we need current inventory. 
        // Let's simplified approach:
        // Just random quantities 1-10. 
        // Real shortage depends on actual inventory. 
        // If we want FORCED shortage, we pick items with 0 inventory or request huge amount (e.g. 100).

        const createdOrders = [];
        const NUM_ORDERS = 5;

        for (let i = 0; i < NUM_ORDERS; i++) {
            const isShortageOrder = Math.random() < 0.3; // 30% chance of shortage
            const numItems = Math.floor(Math.random() * 5) + 1; // 1-5 items per order

            // Create Order
            const code = `TEST-${Date.now()}-${i}`;
            const { data: order, error: orderError } = await supabase
                .from('orders')
                .insert({
                    code: code.toUpperCase(),
                    customer_name: `Test User ${Math.floor(Math.random() * 100)}`,
                    status: 'PENDING',
                    is_approved: false
                })
                .select()
                .single();

            if (orderError) continue;

            // Pick random products
            const selectedProducts: { id: string, sku: string }[] = [];
            for (let j = 0; j < numItems; j++) {
                const randomProd = products[Math.floor(Math.random() * products.length)];
                if (!selectedProducts.find(p => p.id === randomProd.id)) {
                    selectedProducts.push(randomProd);
                }
            }

            // Create Items
            const items = selectedProducts.map(p => {
                let qty = Math.floor(Math.random() * 5) + 1; // Normal qty 1-5
                if (isShortageOrder && Math.random() < 0.5) {
                    qty = 100; // Force shortage for this item
                }
                return {
                    order_id: order.id,
                    product_id: p.id,
                    quantity: qty
                };
            });

            const { error: itemError } = await supabase.from('order_items').insert(items);
            if (!itemError) createdOrders.push(code);
        }

        return NextResponse.json({
            success: true,
            message: `Created ${createdOrders.length} orders`,
            orders: createdOrders
        });

    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message });
    }
}
