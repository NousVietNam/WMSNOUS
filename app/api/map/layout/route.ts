import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function GET() {
    try {
        const { data: locations, error } = await supabase
            .from('locations')
            .select('id, code, type, pos_x, pos_y, width, height, rotation, level_order, capacity')
            .order('code')

        if (error) throw error

        return NextResponse.json({ success: true, data: locations })
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message }, { status: 500 })
    }
}

export async function POST(request: Request) {
    try {
        const { updates } = await request.json()
        if (!Array.isArray(updates)) return NextResponse.json({ success: false, error: 'Invalid data' })

        // Batch update is tricky in Supabase via simple REST if specific different values.
        // We can loop or use upsert. Upsert requires all columns usually or primary key.

        const { error } = await supabase
            .from('locations')
            .upsert(updates.map((u: any) => ({
                id: u.id,
                code: u.code,
                type: u.type,
                pos_x: u.pos_x,
                pos_y: u.pos_y,
                width: u.width,
                height: u.height,
                rotation: u.rotation,
                level_order: u.level_order || 0
            })))

        if (error) throw error

        return NextResponse.json({ success: true })
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message }, { status: 500 })
    }
}
