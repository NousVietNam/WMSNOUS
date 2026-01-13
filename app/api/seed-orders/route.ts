import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST() {
    try {
        // 1. Fetch ALL inventory items to determine stock status
        // We need product_id and total quantity
        const { data: invItems, error: invError } = await supabase
            .from('inventory_items')
            .select('product_id, quantity, allocated_quantity');

        if (invError) throw invError;

        // Group by product
        const productStock: Record<string, number> = {};
        invItems?.forEach((item: any) => {
            const avail = (item.quantity || 0) - (item.allocated_quantity || 0);
            productStock[item.product_id] = (productStock[item.product_id] || 0) + avail;
        });

        // 2. Fetch Products
        const { data: products } = await supabase.from('products').select('id, sku').limit(2000);
        if (!products || products.length === 0) return NextResponse.json({ success: false, error: 'No products' });

        // 3. Classify Products
        const availableProds: any[] = []; // Have stock > 50 (safe)
        const emptyProds: any[] = [];     // Have stock <= 0
        // We can also have a 'low stock' group but user asked for "Complete Stock" and "No Stock"

        products.forEach((p: any) => {
            const stock = productStock[p.id] || 0;
            if (stock > 50) availableProds.push(p);
            else if (stock <= 0) emptyProds.push(p);
        });

        // Fallback: If not enough available/empty, just use whatever we have or random
        // Ideally we should warn, but let's do best effort
        if (availableProds.length < 10) console.warn("Not enough available products for scenario");
        if (emptyProds.length < 10) console.warn("Not enough empty products for scenario");

        const createdOrders: string[] = [];

        // helper
        const createOrder = async (prefix: string, items: any[]) => {
            const code = `${prefix}-${Date.now().toString().slice(-6)}`;
            const { data: order } = await supabase.from('orders').insert({
                code,
                customer_name: `Test ${prefix}`,
                status: 'PENDING',
                is_approved: false // User can approve manually
            }).select().single();

            if (!order) return;

            const lines = items.map((p) => ({
                order_id: order.id,
                product_id: p.id,
                quantity: Math.floor(Math.random() * 5) + 1, // 1-5 qty
                allocated_quantity: 0
            }));

            await supabase.from('order_items').insert(lines);
            createdOrders.push(code);
        };

        const pickRandom = (arr: any[], count: number) => {
            const res = [];
            for (let i = 0; i < count; i++) {
                if (arr.length === 0) break;
                res.push(arr[Math.floor(Math.random() * arr.length)]);
            }
            return res;
        };

        // SCENARIO 1: 3 Orders - Full Stock
        // Each order 30-40 items
        for (let i = 0; i < 3; i++) {
            const count = Math.floor(Math.random() * 11) + 30; // 30-40
            const items = pickRandom(availableProds, count);
            if (items.length > 0) await createOrder(`FULL-${i + 1}`, items);
        }

        // SCENARIO 2: 3 Orders - No Stock
        for (let i = 0; i < 3; i++) {
            const count = Math.floor(Math.random() * 11) + 30;
            const items = pickRandom(emptyProds, count);
            if (items.length > 0) await createOrder(`EMPTY-${i + 1}`, items);
        }

        // SCENARIO 3: 3 Orders - Mixed (Has stock + No stock)
        for (let i = 0; i < 3; i++) {
            const count = Math.floor(Math.random() * 11) + 30;
            const half = Math.floor(count / 2);
            const setA = pickRandom(availableProds, half);
            const setB = pickRandom(emptyProds, count - half);
            const items = [...setA, ...setB];
            if (items.length > 0) await createOrder(`MIX-${i + 1}`, items);
        }

        return NextResponse.json({
            success: true,
            message: `Created ${createdOrders.length} test orders`,
            orders: createdOrders
        });

    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message });
    }
}
