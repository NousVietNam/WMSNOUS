import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
    try {
        const { userId, newPassword } = await req.json()

        if (!userId || !newPassword) {
            return NextResponse.json(
                { success: false, error: 'Missing userId or newPassword' },
                { status: 400 }
            )
        }

        // Create Supabase Admin client
        const supabaseAdmin = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!,
            {
                auth: {
                    autoRefreshToken: false,
                    persistSession: false
                }
            }
        )

        // Update user password
        const { data, error } = await supabaseAdmin.auth.admin.updateUserById(
            userId,
            { password: newPassword }
        )

        if (error) {
            return NextResponse.json(
                { success: false, error: error.message },
                { status: 400 }
            )
        }

        return NextResponse.json({ success: true })

    } catch (error: any) {
        return NextResponse.json(
            { success: false, error: error.message },
            { status: 500 }
        )
    }
}
