import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function POST(request: Request) {
    try {
        const { zoneType, width, height } = await request.json()

        if (!zoneType || !['OFFICE', 'SHIPPING', 'RECEIVING'].includes(zoneType)) {
            return NextResponse.json({ success: false, error: 'Invalid zone type' }, { status: 400 })
        }

        // Generate a unique code for this zone
        const zoneName = zoneType === 'OFFICE' ? 'VP' : zoneType === 'SHIPPING' ? 'XH' : 'NH'

        // Check existing zones of this type
        const { data: existing } = await supabase
            .from('locations')
            .select('code')
            .eq('type', zoneType)
            .order('code', { ascending: false })
            .limit(1)

        let counter = 1
        if (existing && existing.length > 0) {
            const lastCode = existing[0].code
            const match = lastCode.match(/\d+$/)
            if (match) {
                counter = parseInt(match[0]) + 1
            }
        }

        const code = `${zoneName}-${String(counter).padStart(2, '0')}`

        // Insert new zone at position (0, 0) - user can move it later
        const { data: newZone, error } = await supabase
            .from('locations')
            .insert({
                code,
                type: zoneType,
                pos_x: 0,
                pos_y: 0,
                width: width || 4,
                height: height || 3,
                rotation: 0,
                capacity: 0 // Special zones don't have capacity
            })
            .select()
            .single()

        if (error) throw error

        return NextResponse.json({ success: true, data: newZone })
    } catch (e: any) {
        console.error('Error creating zone:', e)
        return NextResponse.json({ success: false, error: e.message }, { status: 500 })
    }
}
