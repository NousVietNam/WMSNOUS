import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
    try {
        const { userId, name, role, telegram_chat_id } = await req.json()

        if (!userId) {
            return NextResponse.json({ success: false, error: 'User ID is required' }, { status: 400 })
        }

        const supabaseAdmin = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!,
            {
                auth: { autoRefreshToken: false, persistSession: false }
            }
        )

        // Update Auth Metadata as well
        if (name || role) {
            await supabaseAdmin.auth.admin.updateUserById(userId, {
                user_metadata: { name, role }
            })
        }

        // Update users table
        const { error: dbError } = await supabaseAdmin
            .from('users')
            .update({
                name,
                role,
                telegram_chat_id
            })
            .eq('id', userId)

        if (dbError) {
            return NextResponse.json({ success: false, error: dbError.message }, { status: 400 })
        }

        return NextResponse.json({ success: true })

    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }
}
