import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import Papa from 'papaparse'

// Initialize Supabase Client (Service Role for Admin Import)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! // Using Anon is risky if RLS not set, but standard for this MVP context. ideally Service Role.
// Ideally use SERVICE_ROLE_KEY if we have it, but for now stick to what we know works in client-side context (which this is not).
// Actually, for API routes, we might need the Service Role Key to bypass RLS if the user isn't passed through.
// But we can just use the anon key if we accept RLS will block if not authenticated?
// No, API routes run on server. We usually use a Service Role key to bypass RLS for "Seed" ops.
// Checking .env, I only see ANON_KEY. So I will use ANON_KEY. RLS on 'locations' might be public read/write or restricted.
// "admin/seed" page usually implies we have admin powers.
// For simplicity, let's assume ANON_KEY works or I need to handle auth in API.
// Better: The client should do the import? No, file upload.
// I'll keep it simple: Read CSV, simple insert.

const supabase = createClient(supabaseUrl, supabaseServiceKey)

export async function POST(request: Request) {
    try {
        const formData = await request.formData()
        const file = formData.get('file') as File

        if (!file) {
            return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })
        }

        const text = await file.text()

        // Parse CSV
        const { data } = Papa.parse(text, {
            header: true,
            skipEmptyLines: true,
            transformHeader: (h) => h.trim().toLowerCase()
        })

        // Map CSV to DB Columns
        // Expected CSV Header: Code, Type, Capacity, Description
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const records = data.map((row: any) => ({
            code: row['code'] || row['mã'] || row['ma'],
            type: (row['type'] || row['loại'] || 'SHELF').toUpperCase(), // Default SHELF
            capacity: parseInt(row['capacity'] || row['sức chứa'] || '100'),
            description: row['description'] || row['mô tả'] || ''
        })).filter(r => r.code) // Ensure code exists

        if (records.length === 0) {
            return NextResponse.json({ error: 'No valid records found' }, { status: 400 })
        }

        // Upsert to Supabase
        const { error } = await supabase
            .from('locations')
            .upsert(records, { onConflict: 'code', ignoreDuplicates: false })

        if (error) {
            console.error("Supabase Error:", error)
            return NextResponse.json({ error: error.message }, { status: 500 })
        }

        return NextResponse.json({ success: true, count: records.length })

    } catch (error) {
        console.error("Import Error:", error)
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
    }
}
