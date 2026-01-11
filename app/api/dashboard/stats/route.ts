import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function GET() {
    try {
        // 1. Order Stats
        const { data: orders } = await supabase.from('orders').select('id, status, created_at')

        const orderStats = {
            total: orders?.length || 0,
            today: orders?.filter(o => new Date(o.created_at).toDateString() === new Date().toDateString()).length || 0,
            pending: orders?.filter(o => ['PENDING', 'ALLOCATED'].includes(o.status)).length || 0,
            picking: orders?.filter(o => o.status === 'PICKING').length || 0,
            packed: orders?.filter(o => o.status === 'PACKED').length || 0,
            shipped: orders?.filter(o => o.status === 'SHIPPED').length || 0,
            completed: orders?.filter(o => o.status === 'COMPLETED').length || 0,
        }

        // 2. Inventory Stats
        const { count: skuCount } = await supabase.from('products').select('*', { count: 'exact', head: true })
        const { data: inventory } = await supabase.from('inventory_items').select('quantity, box_id')

        const totalItems = inventory?.reduce((sum, item) => sum + item.quantity, 0) || 0

        // 3. Box Stats
        const { data: boxes } = await supabase.from('boxes').select('type')
        const storageBoxes = boxes?.filter(b => b.type === 'STORAGE').length || 0
        const outboxes = boxes?.filter(b => b.type === 'OUTBOX').length || 0

        // 4. Recent Activity (Transactions)
        const { data: recentActivity } = await supabase
            .from('transactions')
            .select('*')
            .order('timestamp', { ascending: false })
            .limit(10)

        // 5. Activity Trend (Last 7 Days)
        // Group transactions by date
        const today = new Date()
        const last7Days = Array.from({ length: 7 }, (_, i) => {
            const d = new Date()
            d.setDate(today.getDate() - 6 + i)
            return d.toISOString().split('T')[0]
        })

        const { data: recentTx } = await supabase
            .from('transactions')
            .select('timestamp, type')
            .gte('timestamp', last7Days[0])

        const trendData = last7Days.map(date => {
            const dayTx = recentTx?.filter(tx => tx.timestamp.startsWith(date))
            return {
                date: date.split('-').slice(1).join('/'), // MM/DD
                inbound: dayTx?.filter(tx => tx.type === 'IMPORT').length || 0,
                outbound: dayTx?.filter(tx => ['PACK', 'SHIP'].includes(tx.type)).length || 0
            }
        })

        return NextResponse.json({
            success: true,
            data: {
                orders: orderStats,
                inventory: {
                    skus: skuCount || 0,
                    totalItems,
                    storageBoxes,
                    outboxes
                },
                activity: recentActivity || [],
                trends: trendData
            }
        })

    } catch (e: any) {
        console.error(e)
        return NextResponse.json({ success: false, error: e.message }, { status: 500 })
    }
}
