import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: Request) {
    try {
        const { orderId } = await request.json()

        if (!orderId) {
            return NextResponse.json({ success: false, error: 'orderId is required' }, { status: 400 })
        }

        const { data, error } = await supabase.rpc('ship_outbound', {
            p_order_id: orderId
        })

        if (error) throw error

        return NextResponse.json(data)
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message }, { status: 500 })
    }
}
