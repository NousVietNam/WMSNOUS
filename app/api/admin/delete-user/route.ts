import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
    try {
        const { userId } = await req.json()

        if (!userId) {
            return NextResponse.json(
                { success: false, error: 'Missing userId' },
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

        // Delete from users table first
        const { error: dbError } = await supabaseAdmin
            .from('users')
            .delete()
            .eq('id', userId)

        if (dbError) {
            return NextResponse.json(
                { success: false, error: dbError.message },
                { status: 400 }
            )
        }

        // Delete from Supabase Auth
        const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(userId)

        if (authError) {
            // If user is not found in Auth, consider it a success (orphaned record in public table already deleted)
            if (authError.message.includes('User not found') || authError.message.includes('AuthApiError: User not found')) {
                console.warn(`User ${userId} not found in Auth, but deleted from public schema.`)
            } else {
                return NextResponse.json(
                    { success: false, error: authError.message },
                    { status: 400 }
                )
            }
        }

        return NextResponse.json({ success: true })

    } catch (error: any) {
        return NextResponse.json(
            { success: false, error: error.message },
            { status: 500 }
        )
    }
}
