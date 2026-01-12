
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export async function GET() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!url || !key) {
        return NextResponse.json({ error: "Missing Env Vars for Service Role", url: !!url, key: !!key })
    }

    const supabase = createClient(url, key)

    const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .limit(1)

    return NextResponse.json({
        status: 'Debug Transaction Schema',
        keys: data && data[0] ? Object.keys(data[0]) : [],
        sample: data,
        error
    })
}
