import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET() {
    const sql = `
        -- 1. Update Orders Status Check
        ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
        ALTER TABLE orders ADD CONSTRAINT orders_status_check CHECK (status IN ('PENDING', 'ALLOCATED', 'PICKING', 'COMPLETED', 'SHIPPED', 'CANCELLED'));

        -- 2. Update Transfer Orders Status Check
        ALTER TABLE transfer_orders DROP CONSTRAINT IF EXISTS transfer_orders_status_check;
        ALTER TABLE transfer_orders ADD CONSTRAINT transfer_orders_status_check CHECK (status IN ('pending', 'approved', 'allocated', 'picking', 'completed', 'shipped', 'cancelled'));

        -- 3. Add shipped_at columns
        ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipped_at TIMESTAMPTZ;
        ALTER TABLE transfer_orders ADD COLUMN IF NOT EXISTS shipped_at TIMESTAMPTZ;

        -- 4. Reload Postgrest
        NOTIFY pgrst, 'reload config';
    `;

    try {
        // Since exec_sql is missing, let's try to create it first if possible
        // or just run this block if we can figure out the RPC name.
        // If all else fails, I will instruct the user to run it in Supabase SQL Editor.
        const { error } = await supabase.rpc('exec_sql', { sql_query: sql });

        if (error) {
            return NextResponse.json({
                success: false,
                error,
                msg: "RPC 'exec_sql' not found. Please run the SQL manually in Supabase SQL Editor.",
                sql: sql
            });
        }

        return NextResponse.json({ success: true });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message });
    }
}
