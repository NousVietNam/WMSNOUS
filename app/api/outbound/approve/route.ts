
import { supabase } from '@/lib/supabase'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
    const { orderId } = await request.json()

    if (!orderId) {
        return NextResponse.json({ error: 'Missing orderId' }, { status: 400 })
    }

    try {
        const { data, error } = await supabase.rpc('approve_outbound', {
            p_order_id: orderId
        })

        if (error) throw error

        if (!data.success) {
            return NextResponse.json({ error: data.error, missing: data.missing }, { status: 400 })
        }

        return NextResponse.json({ success: true, data })
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
