import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Need standalone client for API
const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: Request) {
    try {
        const { orderId } = await request.json()
        if (!orderId) return NextResponse.json({ success: false, error: 'No orderId' }, { status: 400 })

        // 1. Fetch Order Items
        const { data: orderItems } = await supabase
            .from('order_items')
            .select('product_id, quantity, allocated_quantity')
            .eq('order_id', orderId)

        if (!orderItems || orderItems.length === 0)
            return NextResponse.json({ success: false, error: 'Empty order' }, { status: 400 })

        // Identify demand
        const demandMap: Record<string, number> = {} // productId -> remaining qty
        orderItems.forEach(item => {
            const needed = item.quantity - (item.allocated_quantity || 0)
            if (needed > 0) demandMap[item.product_id] = needed
        })
        const productIds = Object.keys(demandMap)
        if (productIds.length === 0)
            return NextResponse.json({ success: false, error: 'Order already allocated' })

        // 2. Fetch Inventory for these products
        // We want to "Prioritize boxes with MANY codes, MANY goods".
        // So we fetch all available inventory for these products.
        // 2. Usage of DB 'allocated_quantity'
        // We only care about items where actual quantity > allocated quantity
        const { data: inventory } = await supabase
            .from('inventory_items')
            .select('id, product_id, quantity, allocated_quantity, box_id, location_id, boxes(code)')
            .in('product_id', productIds)
            .gt('quantity', 0)
            .not('box_id', 'is', null)

        if (!inventory || inventory.length === 0) return NextResponse.json({ success: true, message: 'No inventory found', jobCount: 0, tasks: 0 })

        // Calculate logical available
        const availableInventory = inventory.map(inv => {
            // DB Trigger maintains allocated_quantity, so we trust it.
            const realAvailable = Math.max(0, inv.quantity - (inv.allocated_quantity || 0))
            return { ...inv, quantity: realAvailable }
        }).filter(inv => inv.quantity > 0)

        if (availableInventory.length === 0)
            return NextResponse.json({ success: true, message: 'No available inventory (fully allocated)', jobCount: 0 })

        // 3. Pre-check: Strict Feasibility Analysis
        // Group inventory by product to check totals
        const aggregateStock: Record<string, number> = {}
        availableInventory.forEach(inv => {
            aggregateStock[inv.product_id] = (aggregateStock[inv.product_id] || 0) + inv.quantity
        })

        const missingItems: any[] = []
        for (const pid of productIds) {
            const needed = demandMap[pid]
            const available = aggregateStock[pid] || 0
            if (available < needed) {
                missingItems.push({
                    product_id: pid,
                    needed: needed,
                    available: available,
                    missing: needed - available
                })
            }
        }

        if (missingItems.length > 0) {
            // Fetch product names for better error reporting
            const missingIds = missingItems.map(m => m.product_id)
            const { data: prodInfo } = await supabase.from('products').select('id, name, sku').in('id', missingIds)
            const prodMap = new Map(prodInfo?.map(p => [p.id, p]) || [])

            const detailedMissing = missingItems.map(m => ({
                ...m,
                sku: prodMap.get(m.product_id)?.sku || 'Unknown',
                name: prodMap.get(m.product_id)?.name || 'Unknown Product'
            }))

            return NextResponse.json({
                success: false,
                reason: 'SHORTAGE',
                message: 'Không đủ tồn kho để điều phối đơn hàng này.',
                missingItems: detailedMissing
            })
        }
        // ... (use availableInventory instead of inventory)
        const storageUnits: Record<string, {
            type: 'BOX' | 'LOC',
            id: string,
            code: string,
            items: any[],
            score: number
        }> = {}

        availableInventory.forEach(inv => {
            // Identifier: BoxID (Strict Hierarchy)
            const key = `BOX:${inv.box_id}`
            if (!storageUnits[key]) {
                storageUnits[key] = {
                    type: 'BOX',
                    id: inv.box_id,
                    code: (Array.isArray(inv.boxes) ? inv.boxes[0]?.code : (inv.boxes as any)?.code) || 'UNKNOWN',
                    items: [],
                    score: 0
                }
            }
            // ... (rest same, uses inv which is now modified)
            const needed = demandMap[inv.product_id] || 0
            if (needed > 0) {
                const take = Math.min(needed, inv.quantity)
                storageUnits[key].score += (10 + take)
                storageUnits[key].items.push({ ...inv, canTake: take })
            }
        })

        // Sort storage units by Score DESC
        const sortedUnits = Object.values(storageUnits).sort((a, b) => b.score - a.score)

        // 4. allocation Loop
        const tasks: any[] = []

        // We need a job. Let's create one pending job.
        // In real app, we might check if open job exists.
        // Check if job already exists (Prevent Double Click / Double Allocate)
        const { data: existingJob } = await supabase
            .from('picking_jobs')
            .select('id')
            .eq('order_id', orderId)
            .neq('status', 'COMPLETED') // If there's an active job
            .maybeSingle()

        if (existingJob) {
            return NextResponse.json({ success: false, error: 'Đơn hàng đã có nhiệm vụ lấy hàng đang xử lý (Job ID: ' + existingJob.id + ')' })
        }

        const { data: jobData, error: jobError } = await supabase
            .from('picking_jobs')
            .insert({ order_id: orderId, status: 'OPEN' })
            .select()
            .single()

        if (jobError) throw jobError
        const jobId = jobData.id

        for (const unit of sortedUnits) {
            // For each item in this best unit
            for (const item of unit.items) {
                const currentNeed = demandMap[item.product_id]
                if (!currentNeed || currentNeed <= 0) continue

                const take = Math.min(currentNeed, item.quantity)
                if (take > 0) {
                    // Create Task
                    tasks.push({
                        job_id: jobId,
                        box_id: unit.type === 'BOX' ? unit.id : null,
                        location_id: unit.type === 'LOC' ? unit.id : null,
                        product_id: item.product_id,
                        quantity: take,
                        status: 'PENDING'
                    })

                    // Update Demand
                    demandMap[item.product_id] -= take
                }
            }
            // Stop if all demand met? 
            // Check if any demand > 0
            const remaining = Object.values(demandMap).reduce((a, b) => a + b, 0)
            if (remaining <= 0) break
        }

        // 5. Save Tasks & Update Order Items
        // Note: We are NOT deducting inventory yet. That happens at "Pick Confirmation".
        // But we SHOULD update 'allocated_quantity' on order_items to reserve.

        if (tasks.length > 0) {
            await supabase.from('picking_tasks').insert(tasks)

            // Update order_items allocated_qty
            // Re-calculate totals from tasks just created (simplest way approx)
            // Or better: Use the delta we tracked.

            // To be safe, let's just update based on what we tasked.
            const allocatedTotals: Record<string, number> = {}
            tasks.forEach(t => {
                allocatedTotals[t.product_id] = (allocatedTotals[t.product_id] || 0) + t.quantity
            })

            for (const [pid, qty] of Object.entries(allocatedTotals)) {
                // We need to increment the DB value. 
                // Using RPC would be atomicaly safer, but for now strict read-update.
                const { data: current } = await supabase.from('order_items').select('allocated_quantity').eq('order_id', orderId).eq('product_id', pid).single()
                if (current) {
                    const { error: updateError } = await supabase.from('order_items')
                        .update({ allocated_quantity: (current.allocated_quantity || 0) + qty })
                        .eq('order_id', orderId)
                        .eq('product_id', pid)

                    if (updateError) {
                        console.error(`Failed to update order_item ${pid}:`, updateError)
                        // Don't throw, try to finish others? Or throw?
                        // If we don't update allocated_qty, we risk over-selling. Critical.
                        throw new Error(`Failed to update allocation count: ${updateError.message}`)
                    }
                }
            }

            const { error: statusError } = await supabase.from('orders').update({ status: 'ALLOCATED' }).eq('id', orderId)
            if (statusError) throw statusError
        }

        return NextResponse.json({ success: true, jobCount: 1, tasks: tasks.length })

    } catch (e: any) {
        console.error(e)
        return NextResponse.json({ success: false, error: e.message }, { status: 500 })
    }
}
