import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET() {
    try {
        // Parallel fetch: 
        // 1. Heavy stats via optimized RPC
        // 2. Recent Activity (Limit 10)
        // 3. Trends (Last 7 days)

        const today = new Date()
        const last7Days = Array.from({ length: 7 }, (_, i) => {
            const d = new Date()
            d.setDate(today.getDate() - 6 + i)
            return d.toISOString().split('T')[0]
        })
        const startDate = last7Days[0]

        const [statsRes, activityRes, trendRes] = await Promise.all([
            supabase.rpc('get_dashboard_stats'),

            supabase
                .from('transactions')
                .select('*')
                .order('timestamp', { ascending: false })
                .limit(10),

            supabase
                .from('transactions')
                .select('timestamp, type, quantity')
                .gte('timestamp', startDate)
        ])

        if (statsRes.error) throw statsRes.error

        const stats = statsRes.data

        // Process Trends (client-side aggregation is fine for 7 days of data)
        const recentTx = trendRes.data || []
        const trendData = last7Days.map(date => {
            const dayTx = recentTx.filter(tx => tx.timestamp.startsWith(date))
            return {
                date: date.split('-').slice(1).join('/'), // MM/DD
                fullDate: date,
                inbound: dayTx.filter(tx => tx.type === 'IMPORT').length || 0,
                outbound: dayTx.filter(tx => ['PACK', 'SHIP', 'EXPORT'].includes(tx.type)).length || 0,
                inboundQty: dayTx.filter(tx => tx.type === 'IMPORT').reduce((sum, tx) => sum + (tx.quantity || 0), 0),
                outboundQty: dayTx.filter(tx => ['PACK', 'SHIP', 'EXPORT'].includes(tx.type)).reduce((sum, tx) => sum + (tx.quantity || 0), 0)
            }
        })

        return NextResponse.json({
            success: true,
            data: {
                orders: stats.orders,
                jobs: stats.jobs,
                inventory: stats.inventory, // The RPC returns the structure we need
                activity: activityRes.data || [],
                trends: trendData
            }
        })

    } catch (e: any) {
        console.error("Dashboard API Error:", e)
        return NextResponse.json({ success: false, error: e.message }, { status: 500 })
    }
}
