import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Force Rebuild: Updated RPC signature to 1 param

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: Request) {
    try {
        const { orderId, strategy } = await request.json()

        if (!orderId) {
            return NextResponse.json({ success: false, error: 'orderId is required' }, { status: 400 })
        }

        const { data, error } = await supabase.rpc('allocate_outbound', {
            p_order_id: orderId
        })

        if (error) throw error

        return NextResponse.json(data)
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message }, { status: 500 })
    }
}
