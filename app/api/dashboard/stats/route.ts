import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function GET() {
    try {
        // 1. Order Stats (from outbound_orders)
        const { data: orders } = await supabase
            .from('outbound_orders')
            .select('id, status, created_at, code')

        const todayStr = new Date().toDateString()

        const orderStats = {
            total: orders?.length || 0,
            today: orders?.filter(o => new Date(o.created_at).toDateString() === todayStr).length || 0,
            pending: orders?.filter(o => ['PENDING'].includes(o.status)).length || 0,
            allocated: orders?.filter(o => ['ALLOCATED'].includes(o.status)).length || 0,
            ready: orders?.filter(o => ['READY'].includes(o.status)).length || 0,
            picking: orders?.filter(o => ['PICKING'].includes(o.status)).length || 0,
            packed: orders?.filter(o => ['PACKED'].includes(o.status)).length || 0,
            shipped: orders?.filter(o => ['SHIPPED'].includes(o.status)).length || 0,
        }

        // 2. Job Stats (from picking_jobs)
        const { data: jobs } = await supabase
            .from('picking_jobs')
            .select('id, status, created_at')

        const jobStats = {
            total: jobs?.length || 0,
            active: jobs?.filter(j => ['PLANNED', 'IN_PROGRESS'].includes(j.status)).length || 0,
            completed: jobs?.filter(j => j.status === 'COMPLETED').length || 0
        }

        // 3. Inventory Stats
        const { count: skuCount } = await supabase.from('products').select('*', { count: 'exact', head: true })

        // Piece Inventory
        const { data: pieceInventory } = await supabase.from('inventory_items').select('quantity')
        const totalPieceItems = pieceInventory?.reduce((sum, item) => sum + item.quantity, 0) || 0

        // Bulk Inventory
        const { data: bulkInventory } = await supabase.from('bulk_inventory').select('quantity')
        const totalBulkItems = bulkInventory?.reduce((sum, item) => sum + item.quantity, 0) || 0

        // 4. Box Stats
        const { data: boxes } = await supabase.from('boxes').select('type')
        const storageBoxes = boxes?.filter(b => b.type === 'STORAGE').length || 0
        const outboxes = boxes?.filter(b => b.type === 'OUTBOX').length || 0

        // 5. Recent Activity (Transactions)
        const { data: recentActivity } = await supabase
            .from('transactions')
            .select('*')
            .order('timestamp', { ascending: false })
            .limit(10)

        // 6. Activity Trend (Last 7 Days)
        const today = new Date()
        const last7Days = Array.from({ length: 7 }, (_, i) => {
            const d = new Date()
            d.setDate(today.getDate() - 6 + i)
            return d.toISOString().split('T')[0]
        })

        const { data: recentTx } = await supabase
            .from('transactions')
            .select('timestamp, type, quantity')
            .gte('timestamp', last7Days[0])

        const trendData = last7Days.map(date => {
            const dayTx = recentTx?.filter(tx => tx.timestamp.startsWith(date))
            return {
                date: date.split('-').slice(1).join('/'), // MM/DD
                fullDate: date,
                inbound: dayTx?.filter(tx => tx.type === 'IMPORT').length || 0,
                outbound: dayTx?.filter(tx => ['PACK', 'SHIP', 'EXPORT'].includes(tx.type)).length || 0,
                inboundQty: dayTx?.filter(tx => tx.type === 'IMPORT').reduce((sum, tx) => sum + (tx.quantity || 0), 0),
                outboundQty: dayTx?.filter(tx => ['PACK', 'SHIP', 'EXPORT'].includes(tx.type)).reduce((sum, tx) => sum + (tx.quantity || 0), 0)
            }
        })

        return NextResponse.json({
            success: true,
            data: {
                orders: orderStats,
                jobs: jobStats,
                inventory: {
                    skus: skuCount || 0,
                    totalItems: totalPieceItems + totalBulkItems,
                    totalPieceItems,
                    totalBulkItems,
                    storageBoxes,
                    outboxes
                },
                activity: recentActivity || [],
                trends: trendData
            }
        })

    } catch (e: any) {
        console.error("Dashboard API Error:", e)
        return NextResponse.json({ success: false, error: e.message }, { status: 500 })
    }
}
