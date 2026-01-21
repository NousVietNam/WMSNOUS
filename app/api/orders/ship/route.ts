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
            return NextResponse.json({ success: false, error: 'Thiếu orderId' }, { status: 400 })
        }

        // Call RPC for Atomic Transaction
        const { data, error } = await supabase.rpc('ship_order', { p_order_id: orderId })

        if (error) throw error

        // Check RPC logical result
        if (!data.success) {
            return NextResponse.json({ success: false, error: data.error }, { status: 400 })
        }

        return NextResponse.json({
            success: true,
            message: data.message
        })

    } catch (e: any) {
        console.error("Ship Error:", e)
        return NextResponse.json({ success: false, error: e.message }, { status: 500 })
    }
}
