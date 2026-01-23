import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import * as XLSX from 'xlsx'

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: Request) {
    try {
        const formData = await request.formData()
        const file = formData.get('file') as File

        if (!file) {
            return NextResponse.json({ success: false, error: 'No file uploaded' }, { status: 400 })
        }

        const buffer = await file.arrayBuffer()

        // Use SheetJS (xlsx) which is robust at handling various encodings automatically
        const workbook = XLSX.read(buffer, { type: 'buffer' })
        const sheetName = workbook.SheetNames[0]
        const sheet = workbook.Sheets[sheetName]

        // Convert to JSON
        let data = XLSX.utils.sheet_to_json(sheet) as any[]

        if (data.length === 0) {
            return NextResponse.json({ success: false, error: 'CSV file is empty' }, { status: 400 })
        }

        // Normalize strings in the data to handle any combined characters
        data = data.map(row => {
            const newRow: any = {}
            for (const key in row) {
                if (typeof row[key] === 'string') {
                    newRow[key] = row[key].normalize('NFC')
                } else {
                    newRow[key] = row[key]
                }
            }
            return newRow
        })

        // Validate headers
        const requiredHeaders = ['code', 'type', 'capacity']
        const headers = Object.keys(data[0])
        const missingHeaders = requiredHeaders.filter(h => !headers.includes(h))

        if (missingHeaders.length > 0) {
            return NextResponse.json({
                success: false,
                error: `Missing required headers: ${missingHeaders.join(', ')}`
            }, { status: 400 })
        }

        // Collect all codes to check for duplicates
        const codes = data.map(row => String(row.code).toUpperCase())

        // 1. Check for duplicates within the CSV itself
        const uniqueCodes = new Set(codes)
        if (uniqueCodes.size !== codes.length) {
            const duplicates = codes.filter((item, index) => codes.indexOf(item) !== index)
            return NextResponse.json({
                success: false,
                error: `Duplicate codes found in CSV: ${Array.from(new Set(duplicates)).join(', ')}`
            }, { status: 400 })
        }

        // 2. Check for existing codes in database
        const { data: existingLocations, error: fetchError } = await supabase
            .from('locations')
            .select('code')
            .in('code', codes)

        if (fetchError) throw fetchError

        if (existingLocations && existingLocations.length > 0) {
            const existingCodes = existingLocations.map(l => l.code)
            return NextResponse.json({
                success: false,
                error: `These location codes already exist: ${existingCodes.join(', ')}`
            }, { status: 400 })
        }

        // 3. Validate types and capacity
        const validTypes = ['SHELF', 'BIN', 'FLOOR']
        for (const row of data) {
            if (!validTypes.includes(String(row.type).toUpperCase())) {
                return NextResponse.json({
                    success: false,
                    error: `Invalid type '${row.type}' for location ${row.code}. Must be one of: ${validTypes.join(', ')}`
                }, { status: 400 })
            }
            if (isNaN(parseInt(row.capacity))) {
                return NextResponse.json({
                    success: false,
                    error: `Invalid capacity '${row.capacity}' for location ${row.code}. Must be a number.`
                }, { status: 400 })
            }
        }

        // 4. Prepare data for insert
        const toInsert = data.map(row => ({
            code: String(row.code).toUpperCase(),
            type: String(row.type).toUpperCase(),
            capacity: parseInt(row.capacity),
            description: row.description || ''
        }))

        const { error: insertError } = await supabase
            .from('locations')
            .insert(toInsert)

        if (insertError) throw insertError

        return NextResponse.json({ success: true, count: toInsert.length })
    } catch (e: any) {
        console.error('Import error:', e)
        return NextResponse.json({ success: false, error: e.message }, { status: 500 })
    }
}
