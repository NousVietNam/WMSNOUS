
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
        const supabaseClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        )

        const { wave_id, user_id } = await req.json()

        if (!wave_id) {
            throw new Error('wave_id is required')
        }

        // 1. Fetch Wave and Items
        const { data: wave, error: waveError } = await supabaseClient
            .from('pick_waves')
            .select('*, outbound_orders(*, outbound_order_items(*, products(sku)))')
            .eq('id', wave_id)
            .single()

        if (waveError) throw waveError
        if (!wave) throw new Error('Wave not found')

        // 2. Aggregate Demand
        const demand: Record<string, { sku: string, items: any[], total: number }> = {}
        wave.outbound_orders.forEach((order: any) => {
            order.outbound_order_items.forEach((item: any) => {
                const productId = item.product_id
                if (!demand[productId]) {
                    demand[productId] = { sku: item.products.sku, items: [], total: 0 }
                }
                demand[productId].items.push(item)
                demand[productId].total += item.quantity
            })
        })

        const productIds = Object.keys(demand)

        const inventoryTable = wave.inventory_type === 'BULK' ? 'bulk_inventory' : 'inventory_items'

        // 3. Fetch Inventory with Sorting Logic
        const { data: inventory, error: invError } = await supabaseClient
            .from(inventoryTable)
            .select('*, boxes!inner(code, location_id, locations!inner(level_order, zone))')
            .in('product_id', productIds)
            .gt('quantity', 0)

        if (invError) throw invError

        const parseBoxCodeForSort = (code: string) => {
            const parts = code.split('-')
            if (parts.length < 3) return 0
            const mmyy = parts[1] // e.g. "0226"
            const xxxx = parts[2] // e.g. "0001"
            if (mmyy.length !== 4) return 0

            const mm = mmyy.substring(0, 2)
            const yy = mmyy.substring(2, 4)
            // Sortable value: YYMMXXXX e.g. 26020001
            return parseInt(yy + mm + xxxx, 10) || 0
        }

        // Apply Sorting: 
        // 1. Level 1 first
        // 2. Box Code LIFO (Newest MMYY and XXXX first)
        const sortedInventory = (inventory || []).sort((a: any, b: any) => {
            // Priority 1: Level 1
            const levelA = a.boxes.locations.level_order === 1 ? 0 : 1
            const levelB = b.boxes.locations.level_order === 1 ? 0 : 1
            if (levelA !== levelB) return levelA - levelB

            // Priority 2: LIFO Box Code
            const valA = parseBoxCodeForSort(a.boxes?.code || '')
            const valB = parseBoxCodeForSort(b.boxes?.code || '')
            return valB - valA // Descending for LIFO
        })

        // 4. Allocation Engine
        const tasks: any[] = []
        const allocationByZone: Record<string, any[]> = {}

        for (const productId in demand) {
            const d = demand[productId]
            let remainingToAllocate = d.total

            // Filter inventory for this product
            const productInv = sortedInventory.filter((inv: any) => inv.product_id === productId)

            // Try to satisfy each order item's quantity
            for (const orderItem of d.items) {
                let itemRemaining = orderItem.quantity

                for (const inv of productInv) {
                    if (itemRemaining <= 0) break

                    const available = inv.quantity - (inv.allocated_quantity || 0)
                    if (available <= 0) continue

                    const canTake = Math.min(available, itemRemaining)

                    const task = {
                        order_item_id: orderItem.id,
                        product_id: productId,
                        box_id: inv.box_id,
                        box_code: inv.boxes?.code,
                        location_id: inv.boxes.location_id,
                        zone: inv.boxes.locations.zone || 'DEFAULT',
                        quantity: canTake
                    }

                    tasks.push(task)
                    if (!allocationByZone[task.zone]) allocationByZone[task.zone] = []
                    allocationByZone[task.zone].push(task)

                    inv.allocated_quantity = (inv.allocated_quantity || 0) + canTake
                    itemRemaining -= canTake
                }

                if (itemRemaining > 0) {
                    throw new Error(`Insufficient stock for SKU: ${d.sku} in Order: ${orderItem.order_id}`)
                }
            }
        }

        // 5. Build Transaction SQL
        // We'll create Picking Jobs for each Zone and then Tasks
        let sql = 'DO $$\nBEGIN\n'

        // Update Wave Status
        sql += `  UPDATE pick_waves SET status = 'RELEASED' WHERE id = '${wave_id}';\n`

        // Update Order Statuses
        const orderIds = wave.outbound_orders.map((o: any) => o.id)
        sql += `  UPDATE outbound_orders SET status = 'ALLOCATED', is_approved = true WHERE id IN ('${orderIds.join("','")}');\n`

        for (const zone in allocationByZone) {
            const job_id = crypto.randomUUID()
            const zoneTasks = allocationByZone[zone]
            const escapedZone = zone.replace(/'/g, "''")
            // Generate friendly code: WP-MMYY-XXXX-Zone
            const shortWaveCode = (wave.code || '').replace('WAVE-', '').replace('W-', '')
            const jobCode = `WP-${shortWaveCode}-${zone}`

            // Create Job
            sql += `  INSERT INTO picking_jobs (id, code, wave_id, type, zone, status) 
                VALUES ('${job_id}', '${jobCode}', '${wave_id}', 'WAVE_PICK', '${escapedZone}', 'PENDING');\n`

            // Create Tasks
            for (const t of zoneTasks) {
                const escapedBoxCode = (t.box_code || '').replace(/'/g, "''")
                sql += `  INSERT INTO picking_tasks (job_id, order_item_id, product_id, box_id, location_id, quantity, status)
                  VALUES ('${job_id}', '${t.order_item_id}', '${t.product_id}', '${t.box_id}', '${t.location_id}', ${t.quantity}, 'PENDING');\n`

                // Update Inventory Allocation
                sql += `  UPDATE ${inventoryTable} SET allocated_quantity = COALESCE(allocated_quantity, 0) + ${t.quantity} 
                  WHERE box_id = '${t.box_id}' AND product_id = '${t.product_id}';\n`
            }
        }

        sql += 'END $$;'

        // Execute Transaction
        const { error: execError } = await supabaseClient.rpc('exec_sql', { sql_query: sql })
        if (execError) throw execError

        return new Response(JSON.stringify({
            success: true,
            message: 'Wave released successfully',
            jobs_created: Object.keys(allocationByZone).length,
            zones: Object.keys(allocationByZone)
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })

    } catch (error: any) {
        console.error('Edge Function Error:', error)
        return new Response(JSON.stringify({
            success: false,
            error: error.message,
            stack: error.stack,
            type: 'Technical/Logic Error'
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400,
        })
    }
})
