import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function GET() {
    try {
        // Use the views created earlier or count manually
        // location_stats view has box_count
        const { data: stats, error } = await supabase
            .from('location_stats')
            .select('*')

        if (error) throw error

        // Fetch boxes with their data
        const { data: boxes } = await supabase
            .from('boxes')
            .select('id, code, location_id')

        // Fetch box stats (total_items)
        const { data: boxStats } = await supabase
            .from('box_stats')
            .select('id, total_items')

        const boxStatMap = new Map(boxStats?.map(b => [b.id, b.total_items]) || [])

        // Map boxes to Locations
        const locationBoxes: Record<string, any[]> = {}
        const locationItems: Record<string, number> = {}

        boxes?.forEach(b => {
            if (!b.location_id) return
            const items = boxStatMap.get(b.id) || 0

            if (!locationBoxes[b.location_id]) locationBoxes[b.location_id] = []
            locationBoxes[b.location_id].push({
                id: b.id,
                code: b.code,
                items: items
            })

            locationItems[b.location_id] = (locationItems[b.location_id] || 0) + items
        })

        const combined = stats?.map(s => ({
            ...s,
            total_items: locationItems[s.id] || 0,
            boxes: locationBoxes[s.id] || []
        }))

        return NextResponse.json({ success: true, data: combined })
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message }, { status: 500 })
    }
}
