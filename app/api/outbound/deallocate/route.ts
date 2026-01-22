
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
    try {
        const { orderId } = await request.json()

        if (!orderId) {
            return NextResponse.json({ error: 'Missing orderId' }, { status: 400 })
        }

        // Use service role to ensure permission to call RPC if needed, 
        // though RPC is Security Definer so standard client might work if user is auth'd.
        // But to be safe and consistent with other admin actions:
        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!,
            {
                auth: {
                    persistSession: false,
                    autoRefreshToken: false,
                }
            }
        )

        const { data, error } = await supabase.rpc('release_outbound', {
            p_order_id: orderId
        })

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 })
        }

        if (!data.success) {
            return NextResponse.json({ error: data.error }, { status: 400 })
        }

        return NextResponse.json({ success: true })
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
