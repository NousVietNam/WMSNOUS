
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Force dynamic to ensure we don't cache the response inappropriately
export const dynamic = 'force-dynamic'

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: Request) {
    try {
        const body = await request.json()
        const { customerCode, startNum, endNum } = body

        if (!customerCode || typeof startNum !== 'number' || typeof endNum !== 'number') {
            return NextResponse.json({ error: 'Missing required fields or invalid types' }, { status: 400 })
        }

        if (startNum > endNum) {
            return NextResponse.json({ error: 'Start number must be less than or equal to end number' }, { status: 400 })
        }

        const count = endNum - startNum + 1
        if (count > 100) {
            return NextResponse.json({ error: 'Maximum 100 boxes per request' }, { status: 400 })
        }

        // 1. Generate list of codes
        const generatedCodes = []
        for (let i = startNum; i <= endNum; i++) {
            // Pad with leading zeros to at least 3 digits, or more if the number is larger
            const suffix = i.toString().padStart(3, '0')
            generatedCodes.push(`HTL-${customerCode}-${suffix}`)
        }

        // 2. Check for duplicates
        // We can do a simple check using "in" clause
        const { data: existing, error: checkError } = await supabase
            .from('boxes')
            .select('code')
            .in('code', generatedCodes)

        if (checkError) throw checkError

        if (existing && existing.length > 0) {
            const existingCodes = existing.map((b: any) => b.code).join(', ')
            return NextResponse.json({
                error: `Duplicate codes found: ${existingCodes}`,
                duplicates: existing.map((b: any) => b.code)
            }, { status: 409 })
        }

        // 3. Get RECEIVING location ID
        let locationId = null
        const { data: locData } = await supabase.from('locations').select('id').eq('code', 'RECEIVING').single()

        if (locData) {
            locationId = locData.id
        } else {
            // Create RECEIVING location if it doesn't exist (Admin privilege via Service Role)
            const { data: newLoc, error: createLocError } = await supabase.from('locations').insert({
                code: 'RECEIVING',
                type: 'receiving',
                description: 'Khu vực tiếp nhận hàng (Mặc định)'
            }).select('id').single()

            if (createLocError || !newLoc) {
                return NextResponse.json({ error: 'Could not find or create RECEIVING location' }, { status: 500 })
            }
            locationId = newLoc.id
        }

        // 4. Insert Boxes
        const boxesToInsert = generatedCodes.map(code => ({
            code,
            status: 'OPEN',
            type: 'STORAGE',
            inventory_type: 'PIECE', // Normal storage behavior
            location_id: locationId
        }))

        const { error: insertError } = await supabase.from('boxes').insert(boxesToInsert)
        if (insertError) throw insertError

        return NextResponse.json({ success: true, count: boxesToInsert.length, codes: generatedCodes })

    } catch (error: any) {
        console.error('Error generating return boxes:', error)
        return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 })
    }
}
