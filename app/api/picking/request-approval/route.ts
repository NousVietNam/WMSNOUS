import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendTelegramMessage } from '@/lib/telegram';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const telegramChatId = process.env.TELEGRAM_CHAT_ID;

const supabase = createClient(supabaseUrl, supabaseKey);

export async function POST(req: NextRequest) {
    try {
        const { p_task_id, p_actual_qty, p_reason, p_user_id } = await req.json();

        // 1. Call RPC
        const { data, error } = await supabase.rpc('request_picking_approval', {
            p_task_id,
            p_actual_qty,
            p_reason,
            p_user_id
        });

        if (error) throw error;
        if (!data.success) throw new Error(data.error);

        // 2. Fetch details for notification
        const { data: ex } = await supabase
            .from('view_picking_exceptions')
            .select('*')
            .eq('id', data.exception_id)
            .single();

        if (ex && telegramChatId) {
            const msg = `🚨 <b>CẢNH BÁO: BÁO THIẾU HÀNG</b>\n\n` +
                `👤 <b>Nhân viên:</b> ${ex.user_name}\n` +
                `📦 <b>Sản phẩm:</b> ${ex.product_sku} (${ex.product_name})\n` +
                `📍 <b>Vị trí:</b> ${ex.box_code || '---'}\n` +
                `🧩 <b>Số lượng:</b> Yêu cầu ${ex.quantity_expected}, Thực tế ${ex.quantity_actual} (Thiếu ${ex.quantity_missing})\n` +
                `📝 <b>Lý do:</b> ${ex.note || '---'}\n` +
                `🔖 <b>Job:</b> ${ex.job_code}\n\n` +
                `👉 Vui lòng truy cập trang Admin để xử lý.`;

            await sendTelegramMessage(telegramChatId, msg);
        }

        return NextResponse.json({ success: true, exception_id: data.exception_id });

    } catch (error: any) {
        console.error('Error in request-approval API:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
