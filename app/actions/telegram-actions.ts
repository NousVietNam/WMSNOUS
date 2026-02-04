'use server';

import { sendTelegramMessage } from '@/lib/telegram';

export async function sendTestNotification() {
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (!chatId) {
        return { success: false, message: 'Chưa cấu hình TELEGRAM_CHAT_ID trong .env' };
    }

    try {
        const result = await sendTelegramMessage(
            chatId,
            `🔔 <b>Kiểm Tra Hệ Thống</b>\n\nĐây là tin nhắn test từ WMS App.\nNếu bạn nhận được tin này, hệ thống thông báo đã hoạt động tốt! ✅`
        );

        if (result && result.ok) {
            return { success: true, message: 'Đã gửi tin nhắn thành công!' };
        } else {
            return { success: false, message: `Lỗi Telegram: ${result?.description || 'Unknown error'}` };
        }
    } catch (error: any) {
        return { success: false, message: `Lỗi hệ thống: ${error.message}` };
    }
}
