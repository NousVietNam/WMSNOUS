import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Initialize Supabase Client
const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function POST(request: Request) {
    try {
        const { prefix = "OUT", from, to, dateStr } = await request.json()

        // Validation
        if (!from || !to || !dateStr) {
            return NextResponse.json({ success: false, error: 'Missing required fields (from, to, dateStr)' }, { status: 400 })
        }

        const start = parseInt(from)
        const end = parseInt(to)

        if (isNaN(start) || isNaN(end) || start > end) {
            return NextResponse.json({ success: false, error: 'Invalid range' }, { status: 400 })
        }

        if (end - start > 1000) {
            return NextResponse.json({ success: false, error: 'Range too large (max 1000)' }, { status: 400 })
        }

        // Generate Codes
        // Format: OUT-MMYY-XXX
        // e.g., OUT-0126-001
        const codesToCreate: string[] = []
        for (let i = start; i <= end; i++) {
            const numPart = i.toString().padStart(3, '0')
            const code = `${prefix}-${dateStr}-${numPart}`
            codesToCreate.push(code)
        }

        // Check for Conflicts
        const { data: existing, error: checkError } = await supabase
            .from('boxes')
            .select('code')
            .in('code', codesToCreate)

        if (checkError) throw checkError

        if (existing && existing.length > 0) {
            const conflictingCodes = existing.map(b => b.code).join(', ')
            return NextResponse.json({
                success: false,
                error: `Mã thùng đã tồn tại: ${conflictingCodes}. Vui lòng kiểm tra lại phạm vi.`
            }, { status: 409 })
        }

        // Insert
        // We assume 'location_id' is optional for Outboxes (mobile/temporary)
        // or we might need a "Packing Area" location default.
        // For now, leave location_id null or undefined.
        const payload = codesToCreate.map(code => ({
            code,
            type: 'OUTBOX', // Ensure schema upgrade ran!
            status: 'OPEN'
        }))

        const { error: insertError } = await supabase
            .from('boxes')
            .insert(payload)

        if (insertError) throw insertError

        return NextResponse.json({ success: true, count: payload.length })

    } catch (e: any) {
        console.error(e)
        return NextResponse.json({ success: false, error: e.message }, { status: 500 })
    }
}
