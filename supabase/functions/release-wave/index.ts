
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

        if (!supabaseUrl || !supabaseKey) {
            throw new Error('Missing Supabase environment variables');
        }

        const supabaseClient = createClient(supabaseUrl, supabaseKey);

        const body = await req.json().catch(() => ({}));
        const { wave_id, user_id } = body;

        if (!wave_id) {
            throw new Error('wave_id is required');
        }

        console.log(`Processing Wave Release for ID: ${wave_id}`);

        // 1. Fetch Wave and Items with detailed join
        const { data: wave, error: waveError } = await supabaseClient
            .from('pick_waves')
            .select(`
                id, code, inventory_type,
                outbound_orders (
                    id, 
                    code,
                    outbound_order_items (
                        id, order_id, product_id, quantity,
                        products (sku)
                    )
                )
            `)
            .eq('id', wave_id)
            .single();

        if (waveError) throw new Error(`Fetch Wave Error: ${waveError.message}`);
        if (!wave) throw new Error('Wave not found');

        const orders = wave.outbound_orders || [];
        if (orders.length === 0) {
            throw new Error('Wave này không có đơn hàng nào để duyệt.');
        }

        // 2. Aggregate Demand
        const demand: Record<string, { sku: string, items: any[], total: number }> = {}
        orders.forEach((order: any) => {
            const items = order.outbound_order_items || [];
            items.forEach((item: any) => {
                const productId = item.product_id
                if (!demand[productId]) {
                    const productData = Array.isArray(item.products) ? item.products[0] : item.products;
                    demand[productId] = { sku: productData?.sku || 'UNKNOWN', items: [], total: 0 }
                }
                demand[productId].items.push(item)
                demand[productId].total += item.quantity
            })
        })

        const productIds = Object.keys(demand);
        if (productIds.length === 0) {
            throw new Error('Wave không có sản phẩm nào để phân bổ.');
        }

        const inventoryTable = wave.inventory_type === 'BULK' ? 'bulk_inventory' : 'inventory_items';

        // 3. Fetch Inventory
        const { data: inventory, error: invError } = await supabaseClient
            .from(inventoryTable)
            .select('*, boxes!inner(code, location_id, locations!inner(level_order, zone))')
            .in('product_id', productIds)
            .gt('quantity', 0);

        if (invError) throw new Error(`Fetch Inventory Error: ${invError.message}`);

        // Helper for LIFO sort
        const parseBoxCodeForSort = (code: string) => {
            const parts = (code || '').split('-')
            if (parts.length < 3) return 0
            const yy = parts[1].substring(2, 4)
            const mm = parts[1].substring(0, 2)
            const xxxx = parts[2]
            return parseInt(yy + mm + xxxx, 10) || 0
        }

        const sortedInventory = (inventory || []).sort((a: any, b: any) => {
            const levelA = (a.boxes?.locations?.level_order === 1 || a.boxes?.locations?.level_order === 0) ? 0 : 1
            const levelB = (b.boxes?.locations?.level_order === 1 || b.boxes?.locations?.level_order === 0) ? 0 : 1
            if (levelA !== levelB) return levelA - levelB
            return parseBoxCodeForSort(b.boxes?.code) - parseBoxCodeForSort(a.boxes?.code);
        })

        // 4. Allocation Engine
        const allocationByZone: Record<string, any[]> = {}
        const localInvSnapshot = [...sortedInventory];

        for (const productId in demand) {
            const d = demand[productId];
            const productInv = localInvSnapshot.filter((inv: any) => inv.product_id === productId);

            for (const orderItem of d.items) {
                let remaining = orderItem.quantity;
                for (const inv of productInv) {
                    if (remaining <= 0) break;
                    const available = inv.quantity - (inv.allocated_quantity || 0);
                    if (available <= 0) continue;

                    const take = Math.min(available, remaining);
                    const zoneName = inv.boxes?.locations?.zone || 'DEFAULT';

                    if (!allocationByZone[zoneName]) allocationByZone[zoneName] = [];
                    allocationByZone[zoneName].push({
                        ...inv,
                        take,
                        order_item_id: orderItem.id
                    });

                    inv.allocated_quantity = (inv.allocated_quantity || 0) + take;
                    remaining -= take;
                }

                if (remaining > 0) {
                    throw new Error(`Thiếu tồn kho cho SKU: ${d.sku} (Còn thiếu: ${remaining})`);
                }
            }
        }

        // 5. Generate SQL Transaction
        let sql = 'DO $$\nBEGIN\n';
        sql += `  UPDATE pick_waves SET status = 'RELEASED' WHERE id = '${wave_id}';\n`;

        const orderIds = orders.map((o: any) => o.id);
        if (orderIds.length > 0) {
            sql += `  UPDATE outbound_orders SET status = 'ALLOCATED', is_approved = true WHERE id IN ('${orderIds.join("','")}');\n`;
        }

        for (const zone in allocationByZone) {
            const job_id = crypto.randomUUID();
            const jobCode = `WP-${(wave.code || '').substring(0, 10)}-${zone}`;

            sql += `  INSERT INTO picking_jobs (id, code, wave_id, type, zone, status) 
                VALUES ('${job_id}', '${jobCode}', '${wave_id}', 'WAVE_PICK', '${zone.replace(/'/g, "''")}', 'PENDING');\n`;

            for (const t of allocationByZone[zone]) {
                sql += `  INSERT INTO picking_tasks (job_id, order_item_id, product_id, box_id, location_id, quantity, status)
                    VALUES ('${job_id}', '${t.order_item_id}', '${t.product_id}', '${t.box_id}', '${t.boxes.location_id}', ${t.take}, 'PENDING');\n`;

                sql += `  UPDATE ${inventoryTable} SET allocated_quantity = COALESCE(allocated_quantity, 0) + ${t.take} 
                    WHERE box_id = '${t.box_id}' AND product_id = '${t.product_id}';\n`;
            }
        }

        sql += 'END $$;';

        const { error: execError } = await supabaseClient.rpc('exec_sql', { sql_query: sql });
        if (execError) throw new Error(`Database Error: ${execError.message}`);

        return new Response(JSON.stringify({
            success: true,
            jobs_created: Object.keys(allocationByZone).length,
            zones: Object.keys(allocationByZone)
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200
        });

    } catch (error: any) {
        console.error('Final Edge Function Error:', error.message);
        return new Response(JSON.stringify({
            success: false,
            error: error.message
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200 // Ensure client can read the JSON error
        });
    }
})
