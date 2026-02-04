import { NextRequest, NextResponse } from 'next/server';
import { sendTelegramMessage, TelegramUpdate } from '@/lib/telegram';

const SECRET_TOKEN = process.env.TELEGRAM_WEBHOOK_SECRET;

export async function POST(req: NextRequest) {
    // 1. Security Check: Verify the Secret Token from Telegram
    const tokenFromHeader = req.headers.get('x-telegram-bot-api-secret-token');

    if (SECRET_TOKEN && tokenFromHeader !== SECRET_TOKEN) {
        console.error('❌ Unauthorized Telegram Webhook attempt');
        return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    try {
        const update: TelegramUpdate = await req.json();

        // 2. Handle Message (User Chatting)
        if (update.message) {
            await handleMessage(update.message);
        }
        // 3. Handle Callback Query (User Clicking Buttons)
        else if (update.callback_query) {
            // Future implementation for buttons
            // await handleCallback(update.callback_query);
        }

        return NextResponse.json({ ok: true });
    } catch (error) {
        console.error('Error handling Telegram Webhook:', error);
        return NextResponse.json({ message: 'Internal Server Error' }, { status: 500 });
    }
}

async function handleMessage(message: any) {
    const chatId = message.chat.id;
    const text = message.text || '';

    console.log(`📩 Received message from ${chatId}: ${text}`);

    // Basic Command Routing
    if (text.startsWith('/start')) {
        await sendTelegramMessage(chatId, `👋 <b>Xin chào!</b>\nTôi là Bot Quản Lý Kho (WMS).\n\nGõ /help để xem danh sách lệnh.`);
    }
    else if (text.startsWith('/help')) {
        await sendTelegramMessage(chatId, `🛠 <b>Danh sách lệnh:</b>\n\n/check [Mã SKU] - Kiểm tra tồn kho\n/status - Xem trạng thái hệ thống\n/myid - Xem ID của bạn`);
    }
    else if (text.startsWith('/myid')) {
        await sendTelegramMessage(chatId, `🆔 Chat ID của bạn là: <code>${chatId}</code>`);
    }
    else if (text.startsWith('/check')) {
        const sku = text.replace('/check', '').trim();
        if (!sku) {
            await sendTelegramMessage(chatId, `⚠️ Vui lòng nhập mã SKU.\nVí dụ: <code>/check PRODUCT-001</code>`);
        } else {
            // TODO: Connect to Real Database here
            await sendTelegramMessage(chatId, `🔍 Đang tra cứu SKU: <b>${sku}</b>...\n(Tính năng đang phát triển)`);
        }
    }
    else {
        // Default reply for unknown text
        await sendTelegramMessage(chatId, `🤖 Tôi không hiểu lệnh này. Gõ /help nhé.`);
    }
}
