import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET: List outbound orders with filters
export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url)
        const type = searchParams.get('type') // SALE, TRANSFER, etc.
        const status = searchParams.get('status')
        const from = searchParams.get('from')
        const to = searchParams.get('to')
        const limit = parseInt(searchParams.get('limit') || '50')

        let query = supabase
            .from('outbound_orders')
            .select(`
                *,
                customers (id, name),
                destinations (id, name),
                outbound_order_items (
                    id, product_id, quantity, picked_quantity, unit_price, line_total,
                    products (id, sku, name)
                )
            `)
            .order('created_at', { ascending: false })
            .limit(limit)

        if (type) query = query.eq('type', type)
        if (status) query = query.eq('status', status)
        if (from) query = query.gte('created_at', from)
        if (to) query = query.lte('created_at', to)

        const { data, error } = await query

        if (error) throw error

        return NextResponse.json({ success: true, data })
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message }, { status: 500 })
    }
}

// POST: Create new outbound order
export async function POST(request: Request) {
    try {
        const body = await request.json()
        const {
            type,
            transfer_type = 'ITEM',
            customer_id,
            destination_id,
            items,
            discount_type,
            discount_value,
            note
        } = body

        // Validate
        if (!type || !['SALE', 'TRANSFER', 'INTERNAL', 'GIFT'].includes(type)) {
            return NextResponse.json({ success: false, error: 'Invalid type' }, { status: 400 })
        }

        if (!items || items.length === 0) {
            return NextResponse.json({ success: false, error: 'Items required' }, { status: 400 })
        }

        // Generate code
        const { data: codeData } = await supabase.rpc('generate_outbound_code', { p_type: type })
        const code = codeData || `OO-${Date.now()}`

        // Create order
        const { data: order, error: orderError } = await supabase
            .from('outbound_orders')
            .insert({
                code,
                type,
                transfer_type,
                customer_id: type === 'SALE' ? customer_id : null,
                destination_id: type === 'TRANSFER' ? destination_id : null,
                discount_type,
                discount_value,
                note,
                status: 'PENDING'
            })
            .select()
            .single()

        if (orderError) throw orderError

        // Create items
        const itemsToInsert = items.map((item: any) => ({
            order_id: order.id,
            product_id: item.product_id,
            quantity: item.quantity,
            unit_price: item.unit_price || 0,
            discount_percent: item.discount_percent || 0
        }))

        const { error: itemsError } = await supabase
            .from('outbound_order_items')
            .insert(itemsToInsert)

        if (itemsError) throw itemsError

        // Fetch final order with totals
        const { data: finalOrder } = await supabase
            .from('outbound_orders')
            .select('*')
            .eq('id', order.id)
            .single()

        return NextResponse.json({ success: true, data: finalOrder })
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message }, { status: 500 })
    }
}
