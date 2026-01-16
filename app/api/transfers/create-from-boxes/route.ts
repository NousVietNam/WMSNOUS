import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
    try {
        const { boxIds, destinationId, note } = await req.json()

        if (!boxIds || !Array.isArray(boxIds) || boxIds.length === 0) {
            return NextResponse.json({ error: 'Missing boxIds' }, { status: 400 })
        }
        if (!destinationId) {
            return NextResponse.json({ error: 'Missing destinationId' }, { status: 400 })
        }

        const supabaseAdmin = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!,
            { auth: { persistSession: false } }
        )

        // 1. Fetch boxes and their inventory
        const { data: boxes, error: boxError } = await supabaseAdmin
            .from('boxes')
            .select(`
                id, 
                code, 
                location_id,
                items:inventory_items(id, product_id, quantity)
            `)
            .in('id', boxIds)

        if (boxError || !boxes) throw boxError

        // 2. Get current user (for created_by)
        const { data: { user } } = await supabaseAdmin.auth.getUser()

        // 3. Create transfer order with BOX type
        const date = new Date()
        const code = `TRF-${date.getFullYear().toString().slice(-2)}${(date.getMonth() + 1).toString().padStart(2, '0')}${date.getDate().toString().padStart(2, '0')}-${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`

        const { data: order, error: orderError } = await supabaseAdmin
            .from('transfer_orders')
            .insert({
                code: code,
                destination_id: destinationId,
                transfer_type: 'BOX', // CRITICAL: Mark as BOX transfer
                note: note || `Điều chuyển ${boxes.length} thùng: ${boxes.map(b => b.code).join(', ')}`,
                status: 'pending',
                created_by: user?.id || null,
                created_at: date.toISOString()
            })
            .select()
            .single()

        if (orderError) throw orderError

        // 4. Create transfer_order_items with box_id reference
        const transferItems = []

        for (const box of boxes) {
            if (box.items && box.items.length > 0) {
                // @ts-ignore
                for (const item of box.items) {
                    transferItems.push({
                        transfer_id: order.id,
                        product_id: item.product_id,
                        box_id: box.id, // CRITICAL: Link to box
                        quantity: item.quantity,
                        from_location_id: box.location_id
                    })
                }
            }
        }

        // Insert transfer items
        if (transferItems.length > 0) {
            const { error: itemsError } = await supabaseAdmin
                .from('transfer_order_items')
                .insert(transferItems)

            if (itemsError) throw itemsError
        }

        // NOTE: We do NOT create picking jobs here
        // User must click "Allocate" in transfer detail page to create jobs

        return NextResponse.json({
            success: true,
            transferCode: code,
            transferId: order.id,
            itemsCreated: transferItems.length
        })

    } catch (error: any) {
        console.error("Create Transfer from Boxes Error:", error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
