
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
    return runQuery()
}

async function runQuery() {
    try {
        const supabase = createClient(
            'https://syjqmspmlctadbaeqyxb.supabase.co',
            'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN5anFtc3BtbGN0YWRiYWVxeXhiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzQxODg3MiwiZXhwIjoyMDgyOTk0ODcyfQ.7h_n_2i60bm2hBtsDzHQ46mnmv2-wlKL9D9aLwL_-NQ',
            { auth: { persistSession: false } }
        )

        const targetCode = 'SO-0126-00031'

        // 1. Get Order
        const { data: order } = await supabase
            .from('outbound_orders')
            .select('*')
            .eq('code', targetCode)
            .single()

        if (!order) return NextResponse.json({ error: 'Order not found' })

        // 2. Get Jobs
        const { data: jobs } = await supabase
            .from('picking_jobs')
            .select('*')
            .eq('order_id', order.id)

        return NextResponse.json({ order, jobs })
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 })
    }
}
