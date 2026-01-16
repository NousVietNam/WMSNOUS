
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
                products (id, sku, name)
            `)
            .eq('transfer_id', transferId)

        if (itemsError || !items || items.length === 0) {
            return NextResponse.json({ success: false, error: 'No items to allocated or error fetching' }, { status: 400 })
        }

        // 2. Fetch Inventory for these products
        const productIds = items.map(i => i.product_id)
        const { data: inventory, error: invError } = await supabaseAdmin
            .from('inventory_items')
            .select('*')
            .in('product_id', productIds)
            .gt('quantity', 0)
            // FIFO based on created_at or just verify quantity. 
            // For simplicity, we just take the first available locations that satisfy quantity.
            // Ideally should sort by created_at asc (FIFO) or location logic.
            .order('quantity', { ascending: false }) // Take from largest boxes first to minimize picks? Or FIFO? Let's assume Largest First for efficiency.

        if (invError) throw invError

        const newPickingJobs: any[] = []
        const skippedItems: string[] = []

        // 3. Allocate Logic
        // Map Inventory by Product
        const inventoryMap: { [key: string]: typeof inventory } = {}
        inventory?.forEach(inv => {
            if (!inventoryMap[inv.product_id]) inventoryMap[inv.product_id] = []
            inventoryMap[inv.product_id].push(inv)
        })

        for (const item of items) {
            const productInventory = inventoryMap[item.product_id] || []
            let remainingQty = item.quantity

            if (productInventory.length === 0) {
                skippedItems.push(item.products?.sku || item.product_id)
                continue
            }

            for (const inv of productInventory) {
                if (remainingQty <= 0) break

                const takeQty = Math.min(remainingQty, inv.quantity)

                // Add to Picking Job
                newPickingJobs.push({
                    transfer_order_id: transferId,
                    product_id: item.product_id,
                    location_id: inv.location_id,
                    quantity: takeQty,
                    status: 'open',
                    created_at: new Date().toISOString()
                })

                // Decrease available inventory in "memory" map so next item (if same product) doesn't double allocate
                inv.quantity -= takeQty
                remainingQty -= takeQty
            }

            if (remainingQty > 0) {
                skippedItems.push(item.products?.sku || item.product_id)
            }
        }

        // 4. Insert Picking Jobs
        if (newPickingJobs.length > 0) {
            const { error: pickError } = await supabaseAdmin.from('picking_jobs').insert(newPickingJobs)
            if (pickError) throw pickError
        }

        // 5. Update Transfer Status?
        // Maybe set to 'allocating' or just return success. User didn't specify status change.
        // But helpful to know it's processed.

        return NextResponse.json({
            success: true,
            allocatedCount: newPickingJobs.length,
            skipped: skippedItems
        })

    } catch (error: any) {
        console.error("Auto Allocate Error:", error)
        return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }
}
