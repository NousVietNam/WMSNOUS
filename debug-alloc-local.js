require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
    const code = 'FULL-3-194899';
    console.log(`DEBUGGING ORDER: ${code}`);

    // 1. Get Order
    const { data: order, error: orderError } = await supabase.from('orders').select('id, status, is_approved').eq('code', code).single();
    if (orderError) {
        console.error('Order Error:', orderError);
        return;
    }
    console.log('Order Found:', order);

    // 2. Get Items
    const { data: items } = await supabase.from('order_items').select('*').eq('order_id', order.id);
    console.log(`Items Found: ${items?.length}`);
    if (!items || items.length === 0) return;

    // CHECK FOR DUPLICATES
    const productCounts = {};
    items.forEach(i => {
        productCounts[i.product_id] = (productCounts[i.product_id] || 0) + 1;
    });
    const duplicates = Object.entries(productCounts).filter(([k, v]) => v > 1);
    if (duplicates.length > 0) {
        console.error('⚠️ DUPLICATE ITEMS FOUND:', duplicates);
    } else {
        console.log('✅ No duplicate items found.');
    }

    // ... (previous setup)
    const demandMap = {};
    items.forEach(item => {
        const needed = item.quantity - (item.allocated_quantity || 0);
        if (needed > 0) demandMap[item.product_id] = needed;
    });
    console.log('Demand Map:', JSON.stringify(demandMap, null, 2));
    const productIds = Object.keys(demandMap);

    if (productIds.length === 0) { console.log('No Demand'); return; }

    // Fetch Inventory
    const { data: inventory } = await supabase
        .from('inventory_items')
        .select('id, product_id, quantity, allocated_quantity, box_id, location_id')
        .in('product_id', productIds)
        .gt('quantity', 0)
        .not('box_id', 'is', null);

    console.log(`Inventory Items Found: ${inventory.length}`);

    // Calculate Available
    const availableInventory = inventory.map(inv => {
        const realAvailable = Math.max(0, inv.quantity - (inv.allocated_quantity || 0));
        return { ...inv, quantity: realAvailable };
    }).filter(inv => inv.quantity > 0);

    console.log(`True Available Items: ${availableInventory.length}`);

    // Storage Units Logic
    const storageUnits = {};
    availableInventory.forEach(inv => {
        const key = `BOX:${inv.box_id}`;
        if (!storageUnits[key]) {
            storageUnits[key] = {
                type: 'BOX',
                id: inv.box_id,
                items: [],
                score: 0
            };
        }

        const needed = demandMap[inv.product_id] || 0;
        if (needed > 0) {
            const take = Math.min(needed, inv.quantity);
            storageUnits[key].score += (10 + take);
            storageUnits[key].items.push({ ...inv, canTake: take });
        }
    });

    const sortedUnits = Object.values(storageUnits).sort((a, b) => b.score - a.score);
    console.log(`Storage Units Created: ${sortedUnits.length}`);

    // Simulation Loop
    const tasks = [];
    const simulatedDemand = { ...demandMap };

    for (const unit of sortedUnits) {
        for (const item of unit.items) {
            const currentNeed = simulatedDemand[item.product_id];
            if (!currentNeed || currentNeed <= 0) continue;

            const take = Math.min(currentNeed, item.quantity);
            if (take > 0) {
                tasks.push({
                    product_id: item.product_id,
                    quantity: take,
                    box_id: unit.id
                });
                simulatedDemand[item.product_id] -= take;
            }
        }
    }

    console.log(`\nSIMULATION RESULT: Created ${tasks.length} tasks.`);

    // Check missing
    console.log('\nRemaining Demand after Simulation:');
    let hasMissing = false;
    for (const [pid, qty] of Object.entries(simulatedDemand)) {
        if (qty > 0) {
            console.log(`❌ Product ${pid} still needs ${qty}`);
            hasMissing = true;
        }
    }
    if (!hasMissing) console.log('✅ All Demand Met!');

    if (tasks.length > 0) {
        // Detailed check for a known failing product
        // 572aabbf-0a7b-4f51-8912-f44a6f67ffeb (from log)
        const samplePid = '572aabbf-0a7b-4f51-8912-f44a6f67ffeb'; // Change if needed
        const sampleTasks = tasks.filter(t => t.product_id === samplePid);
        console.log(`\nTasks for sample product ${samplePid}:`, sampleTasks);
    }
}

run();
