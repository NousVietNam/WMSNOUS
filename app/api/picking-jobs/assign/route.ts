import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { sendTelegramMessage } from '@/lib/telegram'

export async function POST(req: NextRequest) {
    try {
        const { jobId, staffId } = await req.json()

        if (!jobId || !staffId) {
            return NextResponse.json({ success: false, error: 'Missing params' }, { status: 400 })
        }

        const supabaseAdmin = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!,
            { auth: { persistSession: false } }
        )

        // 1. Get Job & Staff info
        const { data: job, error: jobErr } = await supabaseAdmin
            .from('picking_jobs')
            .select('code, zone, type')
            .eq('id', jobId)
            .single()

        const { data: staff, error: staffErr } = await supabaseAdmin
            .from('users')
            .select('name, telegram_chat_id')
            .eq('id', staffId)
            .single()

        if (jobErr || !job) throw new Error('Job not found')
        if (staffErr || !staff) throw new Error('Staff not found')

        // 2. Update Job
        const { error: updateErr } = await supabaseAdmin
            .from('picking_jobs')
            .update({
                assigned_to: staffId,
                status: 'ASSIGNED' // New status or keep OPEN
            })
            .eq('id', jobId)

        if (updateErr) throw updateErr

        // 3. Send Telegram Notification
        if (staff.telegram_chat_id) {
            const message = `🚀 <b>CÔNG VIỆC MỚI ĐƯỢC GÁN!</b>\n\n` +
                `📌 Mã Job: <code>${job.code}</code>\n` +
                `📍 Vùng: <b>${job.zone || 'N/A'}</b>\n` +
                `🛠 Loại: ${job.type}\n\n` +
                `👉 Vui lòng mở App Mobile để bắt đầu nhặt hàng!`

            await sendTelegramMessage(staff.telegram_chat_id, message)
            console.log(`✅ Sent assignment noti to ${staff.name} (${staff.telegram_chat_id})`)
        }

        return NextResponse.json({
            success: true,
            message: `Đã giao việc cho ${staff.name}${staff.telegram_chat_id ? ' và gửi Noti' : ''}`
        })

    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }
}
