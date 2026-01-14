import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: Request) {
    try {
        const body = await request.json()
        const {
            product_id,
            quantity,
            pallet_code,
            batch_number,
            factory_source,
            location_id,
            expiry_date
        } = body

        // Validate required fields
        if (!product_id || !quantity) {
            return NextResponse.json({ error: 'product_id và quantity là bắt buộc' }, { status: 400 })
        }

        // Check if pallet_code already exists (prevent duplicate scan)
        if (pallet_code) {
            const { data: existing } = await supabase
                .from('bulk_inventory')
                .select('id')
                .eq('pallet_code', pallet_code)
                .single()

            if (existing) {
                return NextResponse.json({
                    error: `Mã Pallet "${pallet_code}" đã tồn tại trong hệ thống!`,
                    existing_id: existing.id
                }, { status: 409 })
            }
        }

        // Insert new bulk inventory record
        const { data, error } = await supabase
            .from('bulk_inventory')
            .insert({
                product_id,
                quantity: parseInt(quantity),
                pallet_code: pallet_code || null,
                batch_number: batch_number || null,
                factory_source: factory_source || null,
                location_id: location_id || null,
                expiry_date: expiry_date || null,
                received_at: new Date().toISOString()
            })
            .select()
            .single()

        if (error) {
            console.error('Bulk Inbound Error:', error)
            return NextResponse.json({ error: error.message }, { status: 500 })
        }

        // Log the transaction
        await supabase.from('transactions').insert({
            type: 'INBOUND_BULK',
            entity_type: 'PALLET',
            entity_id: data.id,
            details: {
                product_id,
                quantity,
                pallet_code,
                batch_number,
                factory_source
            }
        })

        return NextResponse.json({
            success: true,
            message: `Đã nhập ${quantity} sản phẩm vào kho Bulk`,
            data
        })
    } catch (error) {
        console.error('Bulk Inbound Error:', error)
        return NextResponse.json({ error: 'Lỗi server' }, { status: 500 })
    }
}

// GET: List bulk inventory with filters
export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url)
        const product_id = searchParams.get('product_id')
        const pallet_code = searchParams.get('pallet_code')

        let query = supabase
            .from('bulk_inventory')
            .select(`
                *,
                products:product_id (id, name, sku, barcode)
            `)
            .order('received_at', { ascending: false })

        if (product_id) {
            query = query.eq('product_id', product_id)
        }
        if (pallet_code) {
            query = query.ilike('pallet_code', `%${pallet_code}%`)
        }

        const { data, error } = await query

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 })
        }

        // Calculate totals
        const totalQuantity = data?.reduce((sum, item) => sum + (item.quantity || 0), 0) || 0

        return NextResponse.json({
            data,
            summary: {
                total_pallets: data?.length || 0,
                total_quantity: totalQuantity
            }
        })
    } catch (error) {
        console.error('Bulk GET Error:', error)
        return NextResponse.json({ error: 'Lỗi server' }, { status: 500 })
    }
}
