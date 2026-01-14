import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function GET() {
    try {
        const { data, error } = await supabase
            .from('map_elements')
            .select('*')
            .order('created_at')

        if (error) throw error

        return NextResponse.json({ success: true, data })
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message }, { status: 500 })
    }
}

export async function POST(request: Request) {
    try {
        const { action, element, id } = await request.json()

        if (action === 'DELETE') {
            const { error } = await supabase
                .from('map_elements')
                .delete()
                .eq('id', id)

            if (error) throw error
            return NextResponse.json({ success: true })
        }

        if (action === 'UPSERT') {
            const { error } = await supabase
                .from('map_elements')
                .upsert({
                    id: element.id,
                    type: element.type,
                    x: element.x,
                    y: element.y,
                    width: element.width,
                    height: element.height,
                    rotation: element.rotation,
                    metadata: element.metadata
                })

            if (error) throw error
            return NextResponse.json({ success: true })
        }

        // Batch Update
        if (action === 'BATCH_UPSERT') {
            const { elements } = await request.json() // Re-read? No, payload structure needs to be consistent.
            // Actually let's assume body is { action: 'BATCH_UPSERT', elements: [...] }
            // But my destructuring above might fail if I didn't anticipate it. 
            // Let's rely on standard 'updates' pattern if needed, but element-by-element or list is fine.
            return NextResponse.json({ success: false, error: "Batch not implemented yet" })
        }

        return NextResponse.json({ success: false, error: 'Invalid action' })

    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message }, { status: 500 })
    }
}
