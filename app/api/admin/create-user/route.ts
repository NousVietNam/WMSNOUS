import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
    try {
        const { email, name, role, password, telegram_chat_id } = await req.json()

        // Validate input
        if (!email || !name || !password) {
            return NextResponse.json(
                { success: false, error: 'Missing required fields' },
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

        // 1. Create user in Supabase Auth
        const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
            email,
            password,
            email_confirm: true, // Auto-confirm email
            user_metadata: {
                name,
                role
            }
        })

        if (authError) {
            return NextResponse.json(
                { success: false, error: authError.message },
                { status: 400 }
            )
        }

        // 2. Insert into users table
        const { error: dbError } = await supabaseAdmin
            .from('users')
            .insert({
                id: authData.user.id,
                email,
                name,
                role,
                telegram_chat_id // Added
            })

        if (dbError) {
            // Rollback: delete auth user if DB insert fails
            await supabaseAdmin.auth.admin.deleteUser(authData.user.id)
            return NextResponse.json(
                { success: false, error: dbError.message },
                { status: 400 }
            )
        }

        return NextResponse.json({
            success: true,
            user: {
                id: authData.user.id,
                email,
                name,
                role,
                telegram_chat_id
            }
        })


    } catch (error: any) {
        return NextResponse.json(
            { success: false, error: error.message },
            { status: 500 }
        )
    }
}
