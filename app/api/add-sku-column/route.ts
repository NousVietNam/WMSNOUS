import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY // Must use Service Role for DDL

    if (!url || !key) return NextResponse.json({ error: "Missing Env Vars" })

    const supabase = createClient(url, key)

    // 1. Check if column exists (naive check by selecting it, if error then missing)
    const { error: checkError } = await supabase.from('transactions').select('sku').limit(1)

    let message = ""

    if (checkError) {
        // Need to add column. 
        // Supabase-js client cannot run raw SQL DDL directly without a function or SQL editor.
        // We will provide the SQL for the user to run.
        message = "Please run this SQL in Supabase SQL Editor:"
    } else {
        message = "Column 'sku' already exists. You can proceed to backfill."
    }

    // 2. We can try to backfill if the column technically exists (or if we want to update empty ones)
    // But since we can't Add Column via Client, we just provide the SQL command.

    const sqlCommand = `
    ALTER TABLE transactions ADD COLUMN IF NOT EXISTS sku TEXT;
    
    -- Optional: Backfill from details
    UPDATE transactions 
    SET sku = details->>'sku' 
    WHERE sku IS NULL AND details->>'sku' IS NOT NULL;
    
    UPDATE transactions 
    SET sku = details->>'product_sku' 
    WHERE sku IS NULL AND details->>'product_sku' IS NOT NULL;
    `

    return NextResponse.json({
        status: "SQL Required",
        message: "Vui lòng chạy câu lệnh SQL dưới đây trong Supabase để thêm cột SKU:",
        sql: sqlCommand
    })
}
