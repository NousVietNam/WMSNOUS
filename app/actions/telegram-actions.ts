'use server';

import { sendTelegramMessage } from '@/lib/telegram';

export async function sendTestNotification() {
    // FALLBACK HARDCODE: Use the known ID if env is missing
    const chatId = process.env.TELEGRAM_CHAT_ID || '8283078267';

    console.log('--- SERVER ACTION: sendTestNotification ---');
    console.log('Target Chat ID:', chatId);

    if (!chatId) {
        return { success: false, message: 'Chưa có Chat ID' };
    }

    try {
        const result = await sendTelegramMessage(
            chatId,
            `🔔 <b>Kiểm Tra Kết Nối WMS</b>\n\n✅ Server Action hoạt động tốt.\n✅ Telegram API kết nối thành công.\n\nTime: ${new Date().toISOString()}`
        );

        if (result && result.ok) {
            return { success: true, message: 'Đã gửi tin nhắn (OK 200)' };
        } else {
            console.error('Telegram Error Result:', result);
            return { success: false, message: `Lỗi API Telegram: ${result?.description || 'Unknown'}` };
        }
    } catch (error: any) {
        console.error('Server Action Crash:', error);
        return { success: false, message: `Lỗi Server: ${error.message}` };
    }
}
