import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Initialize Supabase Client with service role for RLS bypass
const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: Request) {
    try {
        const body = await request.json()
        const { prefix = "OUT", from, to } = body
        const dateStr = body.dateStr || body.date

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
        // Format: OUT-DDMM-XXX
        // e.g., OUT-1401-001 (January 14)
        const codesToCreate: string[] = []
        for (let i = start; i <= end; i++) {
            const numPart = i.toString().padStart(3, '0')
            const code = `${prefix}-${dateStr}-${numPart}`
            codesToCreate.push(code)
        }

        // Check for Conflicts
        // Checking for conflicts

        const { data: existing, error: checkError } = await supabase
            .from('boxes')
            .select('code')
            .in('code', codesToCreate)

        if (checkError) {
            console.error('Check error:', checkError)
            throw checkError
        }

        // Existing boxes found

        if (existing && existing.length > 0) {
            const conflictingCodes = existing.map(b => b.code).join(', ')
            return NextResponse.json({
                success: false,
                error: `Mã thùng đã tồn tại: ${conflictingCodes}. Vui lòng kiểm tra lại phạm vi.`
            }, { status: 409 })
        }

        // 1. Get GATE-OUT location ID
        const { data: locData } = await supabase
            .from('locations')
            .select('id')
            .eq('code', 'GATE-OUT')
            .single()

        // Insert
        const payload = codesToCreate.map(code => ({
            code,
            type: 'OUTBOX',
            status: 'OPEN',
            location_id: locData?.id || null
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
