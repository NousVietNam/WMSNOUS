
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
    try {
        const { transferId } = await req.json()

        if (!transferId) {
            return NextResponse.json({ success: false, error: 'Missing transferId' }, { status: 400 })
        }

        const supabaseAdmin = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!,
            { auth: { persistSession: false } }
        )

        // 1. Fetch Transfer Items
        const { data: items, error: itemsError } = await supabaseAdmin
            .from('transfer_order_items')
            .select(`
                *,
                products (id, sku, name),
                boxes (id, code, location_id) 
            `) // Added boxes fetch
            .eq('transfer_id', transferId)

        if (itemsError || !items || items.length === 0) {
            return NextResponse.json({ success: false, error: 'No items to allocated or error fetching' }, { status: 400 })
        }

        const newTasks: any[] = []
        const skippedItems: string[] = []

        // Create Picking Job Header
        const { data: jobData, error: jobError } = await supabaseAdmin
            .from('picking_jobs')
            .insert({
                transfer_order_id: transferId,
                status: 'open',
                type: 'TRANSFER_PICK'
            })
            .select()
            .single()

        if (jobError || !jobData) throw new Error("Failed to create Picking Job: " + (jobError?.message || "Unknown"))
        const jobId = jobData.id

        // Separating Logic
        const boxItems = items.filter(i => i.box_id)
        const productItems = items.filter(i => !i.box_id && i.product_id)

        // --- A. Handle Box Items ---
        for (const item of boxItems) {
            if (item.boxes) {
                // 1. Create Picking Task for the Box
                newTasks.push({
                    picking_job_id: jobId,
                    box_id: item.box_id,
                    location_id: item.boxes.location_id,
                    quantity: 1, // 1 Box
                    status: 'pending'
                })
            } else {
                skippedItems.push(`BoxID: ${item.box_id} (Not Found)`)
            }
        }

        // 2. Explicitly Reserve Inventory for Boxes
        // Since we are validating the whole box, we mark all items inside as allocated (quantity = allocated_quantity).
        const boxIds = boxItems.map(i => i.box_id).filter(Boolean)
        if (boxIds.length > 0) {
            const { data: boxInvs } = await supabaseAdmin
                .from('inventory_items')
                .select('id, quantity')
                .in('box_id', boxIds)

            if (boxInvs && boxInvs.length > 0) {
                for (const inv of boxInvs) {
                    await supabaseAdmin
                        .from('inventory_items')
                        .update({ allocated_quantity: inv.quantity })
                        .eq('id', inv.id)
                }
            }
        }

        // --- B. Handle Product Items ---
        if (productItems.length > 0) {
            const productIds = productItems.map(i => i.product_id)
            const { data: inventory, error: invError } = await supabaseAdmin
                .from('inventory_items')
                .select('*')
                .in('product_id', productIds)
                .gt('quantity', 0)
                .order('quantity', { ascending: false })

            if (invError) throw invError

            const inventoryMap: { [key: string]: typeof inventory } = {}
            const _inventory = JSON.parse(JSON.stringify(inventory || []))

            _inventory.forEach((inv: any) => {
                if (!inventoryMap[inv.product_id]) inventoryMap[inv.product_id] = []
                inventoryMap[inv.product_id].push(inv)
            })

            for (const item of productItems) {
                const productInventory = inventoryMap[item.product_id] || []
                let remainingQty = item.quantity

                if (productInventory.length === 0) {
                    skippedItems.push(item.products?.sku || item.product_id)
                    continue
                }

                for (const inv of productInventory) {
                    if (remainingQty <= 0) break

                    const available = inv.quantity - (inv.allocated_quantity || 0)
                    if (available <= 0) continue

                    const takeQty = Math.min(remainingQty, available)

                    newTasks.push({
                        picking_job_id: jobId,
                        product_id: item.product_id,
                        location_id: inv.location_id,
                        quantity: takeQty,
                        status: 'pending'
                    })

                    inv.allocated_quantity = (inv.allocated_quantity || 0) + takeQty
                    remainingQty -= takeQty
                }

                if (remainingQty > 0) {
                    skippedItems.push(item.products?.sku || item.product_id)
                }
            }
        }

        // 4. Insert Picking Tasks
        if (newTasks.length > 0) {
            const { error: pickError } = await supabaseAdmin.from('picking_tasks').insert(newTasks)
            if (pickError) throw pickError
        } else {
            // Delete empty job if no tasks (and no skipped? - maybe keep job if skipped exist to show potential?)
            // If ALL skipped (because shortage), job is useless.
            await supabaseAdmin.from('picking_jobs').delete().eq('id', jobId)
            return NextResponse.json({ success: false, reason: 'SHORTAGE_OR_ERROR', missingItems: skippedItems })
        }

        // 5. Update Transfer Status
        await supabaseAdmin.from('transfer_orders').update({ status: 'allocated' }).eq('id', transferId)

        return NextResponse.json({
            success: true,
            allocatedCount: newTasks.length,
            skipped: skippedItems
        })

    } catch (error: any) {
        console.error("Transfer Allocate Error:", error)
        return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }
}
