import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(
    req: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const transferId = params.id

        if (!transferId) {
            return NextResponse.json({ error: 'Missing transferId' }, { status: 400 })
        }

        const supabaseAdmin = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!,
            { auth: { persistSession: false } }
        )

        // 1. Fetch Transfer to check type
        const { data: transfer, error: transferError } = await supabaseAdmin
            .from('transfer_orders')
            .select('id, transfer_type, status')
            .eq('id', transferId)
            .single()

        if (transferError || !transfer) {
            return NextResponse.json({ error: 'Transfer not found' }, { status: 404 })
        }

        if (transfer.status !== 'pending' && transfer.status !== 'approved') {
            return NextResponse.json({ error: 'Transfer already allocated or completed' }, { status: 400 })
        }

        // 2. Fetch Transfer Items
        const { data: items, error: itemsError } = await supabaseAdmin
            .from('transfer_order_items')
            .select(`
                *,
                products (id, sku, name)
            `)
            .eq('transfer_id', transferId)

        if (itemsError || !items || items.length === 0) {
            return NextResponse.json({ error: 'No items to allocate' }, { status: 400 })
        }

        let jobsCreated = 0

        // 3. Handle BOX or ITEM type transfers differently
        if (transfer.transfer_type === 'BOX') {
            console.log(`[Allocate] Processing BOX transfer ${transferId}`)
            console.log(`[Allocate] Items count: ${items.length}`)
            // BOX transfer: Create BOX_PICK jobs (one job per unique box)
            const boxIds = [...new Set(items.map(i => i.box_id).filter(Boolean))]
            console.log(`[Allocate] Found Box IDs:`, boxIds)

            if (boxIds.length === 0) {
                console.warn('[Allocate] No Box IDs found in items despite transfer_type=BOX')
                return NextResponse.json({ error: 'No boxes linked to items' }, { status: 400 })
            }

            const boxJobs = boxIds.map(boxId => ({
                transfer_order_id: transferId,
                type: 'BOX_PICK',
                box_id: boxId,
                status: 'PENDING',
                created_at: new Date().toISOString()
            }))

            console.log(`[Allocate] Creating ${boxJobs.length} jobs`)

            const { error: jobError } = await supabaseAdmin
                .from('picking_jobs')
                .insert(boxJobs)

            if (jobError) {
                console.error('[Allocate] Job Insert Error:', jobError)
                throw jobError
            }

            jobsCreated = boxJobs.length
        } else {
            // ITEM transfer: Allocate from inventory and create ITEM_PICK jobs
            const productIds = items.map(i => i.product_id)

            // Fetch available inventory
            const { data: inventory, error: invError } = await supabaseAdmin
                .from('inventory_items')
                .select('*')
                .in('product_id', productIds)
                .gt('quantity', 0)
                .order('created_at', { ascending: true }) // FEFO

            if (invError) throw invError

            // Build inventory map by product
            const inventoryMap: { [key: string]: any[] } = {}
            inventory?.forEach(inv => {
                if (!inventoryMap[inv.product_id]) inventoryMap[inv.product_id] = []
                inventoryMap[inv.product_id].push(inv)
            })

            const pickingTasks = []
            const skippedItems: string[] = []

            // Allocate for each item
            for (const item of items) {
                const productInventory = inventoryMap[item.product_id] || []
                let remainingQty = item.quantity

                // Prefer from_location_id if specified in transfer item
                let invList = item.from_location_id
                    ? productInventory.filter(inv => inv.location_id === item.from_location_id)
                    : productInventory

                // Fallback to all locations if specific not found
                if (invList.length === 0) invList = productInventory

                for (const inv of invList) {
                    if (remainingQty <= 0) break

                    const available = inv.quantity - (inv.allocated_quantity || 0)
                    if (available <= 0) continue

                    const takeQty = Math.min(remainingQty, available)

                    pickingTasks.push({
                        product_id: item.product_id,
                        from_box_id: inv.box_id,
                        from_location_id: inv.location_id,
                        quantity: takeQty,
                        inventory_item_id: inv.id
                    })

                    // Update allocated_quantity in memory (will batch update later)
                    inv.allocated_quantity = (inv.allocated_quantity || 0) + takeQty
                    remainingQty -= takeQty
                }

                if (remainingQty > 0) {
                    skippedItems.push(item.products?.sku || item.product_id)
                }
            }

            // Create picking job with tasks
            if (pickingTasks.length > 0) {
                const { data: job, error: jobInsertError } = await supabaseAdmin
                    .from('picking_jobs')
                    .insert({
                        transfer_order_id: transferId,
                        type: 'ITEM_PICK',
                        status: 'PENDING',
                        created_at: new Date().toISOString()
                    })
                    .select()
                    .single()

                if (jobInsertError) throw jobInsertError

                // Insert picking tasks
                const tasksToInsert = pickingTasks.map(t => ({
                    ...t,
                    job_id: job.id,
                    status: 'PENDING'
                }))

                const { error: tasksError } = await supabaseAdmin
                    .from('picking_tasks')
                    .insert(tasksToInsert)

                if (tasksError) throw tasksError

                // Update allocated_quantity in inventory
                for (const inv of inventory || []) {
                    if (inv.allocated_quantity > 0) {
                        await supabaseAdmin
                            .from('inventory_items')
                            .update({ allocated_quantity: inv.allocated_quantity })
                            .eq('id', inv.id)
                    }
                }

                jobsCreated = 1

                if (skippedItems.length > 0) {
                    console.warn('Insufficient inventory for:', skippedItems)
                }
            }
        }

        // 4. Update transfer status
        await supabaseAdmin
            .from('transfer_orders')
            .update({ status: 'allocated' })
            .eq('id', transferId)

        return NextResponse.json({
            success: true,
            jobsCreated,
            message: `Allocated successfully. Created ${jobsCreated} picking job(s).`
        })

    } catch (error: any) {
        console.error("Allocate Error:", error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
