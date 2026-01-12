
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export async function GET() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!url || !key) return NextResponse.json({ error: "Missing keys" })

    const supabase = createClient(url, key)

    // 1. Add created_at if missing
    const { error: error1 } = await supabase.rpc('exec_sql', {
        sql: `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();`
    })

    // Attempt standard SQL via RPC if enabled, otherwise fallback to known workaround?
    // Supabase JS client doesn't support raw SQL easily unless you have an RPC function set up for it.
    // HOWEVER, we might not have `exec_sql`.

    // Alternative: We can't easily alter table from client unless we have a specific setup.
    // BUT the error confirms the table EXISTS, just column is missing.

    // Let's try to see if we can use the 'rpc' method if the user has a 'exec_sql' helper (common in some starters).
    // If not, I will have to guide the user to run SQL in Supabase Dashboard.

    // WAIT - I can try to infer if I can "re-create" the table or if there is a way to "patch" it.

    // Let's try to just check if I can use the 'postgres' connection string from env? No, I only have valid Supabase params.

    // OK, I will try to providing a SQL command for the user to run in Supabase SQL Editor.
    // That is the most reliable way.

    return NextResponse.json({
        status: 'Check done',
        instruction: "Please run this SQL in Supabase Dashboard -> SQL Editor:",
        sql: "ALTER TABLE transactions ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();"
    })
}
