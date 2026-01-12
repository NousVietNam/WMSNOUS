import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export async function GET() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!url || !key) return NextResponse.json({ error: "Missing keys" })

    const supabase = createClient(url, key)

    // 1. Check if column exists (indirectly by selecting it, if error then missing)
    const { error } = await supabase.from('transactions').select('quantity').limit(1)

    const missingColumn = error && error.message.includes('quantity')

    return NextResponse.json({
        status: 'Check Quantity Column',
        column_status: missingColumn ? 'Missing' : 'Exists (or unknown error)',
        instruction: "Please run this SQL in Supabase Dashboard -> SQL Editor to add the Quantity column and backfill data:",
        sql: `
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS quantity INTEGER;
UPDATE transactions 
SET quantity = (details->>'quantity')::INTEGER 
WHERE quantity IS NULL AND details->>'quantity' IS NOT NULL;
      `
    })
}
