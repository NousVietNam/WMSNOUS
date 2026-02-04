import { NextRequest, NextResponse } from 'next/server';
import { sendTelegramMessage, TelegramUpdate, getTelegramFile, downloadTelegramFile } from '@/lib/telegram';
import { decodeBarcodeFromBuffer } from '@/lib/barcode-service';
import { getInventoryByBarcode } from '@/lib/inventory-service';

const SECRET_TOKEN = process.env.TELEGRAM_WEBHOOK_SECRET;

export async function POST(req: NextRequest) {
    const tokenFromHeader = req.headers.get('x-telegram-bot-api-secret-token');

    if (SECRET_TOKEN && tokenFromHeader !== SECRET_TOKEN) {
        console.error('❌ Unauthorized Telegram Webhook attempt');
        return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    try {
        const update: TelegramUpdate = await req.json();

        if (update.message) {
            await handleMessage(update.message);
        }

        return NextResponse.json({ ok: true });
    } catch (error) {
        console.error('Error handling Telegram Webhook:', error);
        return NextResponse.json({ message: 'Internal Server Error' }, { status: 500 });
    }
}

async function handleMessage(message: any) {
    const chatId = message.chat.id;

    // 1. Handle Photos or Documents sent as images
    if (message.photo && message.photo.length > 0) {
        return handlePhoto(chatId, message.photo);
    }

    if (message.document && message.document.mime_type?.startsWith('image/')) {
        return handlePhoto(chatId, [message.document], true);
    }

    const text = message.text || '';
    console.log(`📩 Received message from ${chatId}: ${text}`);

    // 2. Command Routing
    if (text.startsWith('/start')) {
        await sendTelegramMessage(chatId, `👋 <b>Xin chào!</b>\nTôi là Bot Quản Lý Kho (WMS) Pro.\n\n🛡 <b>Bạn có thể:</b>\n1. Gửi ảnh chụp mã vạch (Barcode) để tra tồn.\n2. Gõ lệnh tra cứu nhanh.\n\nGõ /help để xem danh sách lệnh.`);
    }
    else if (text.startsWith('/help')) {
        await sendTelegramMessage(chatId, `🛠 <b>Danh sách lệnh:</b>\n\n🔍 /check [Mã SKU/Barcode] - Kiểm tra tồn kho\n🆔 /myid - Xem Chat ID của bạn\n📸 <i>Gửi ảnh Barcode để tra cứu tự động</i>`);
    }
    else if (text.startsWith('/myid')) {
        await sendTelegramMessage(chatId, `🆔 Chat ID của bạn là: <code>${chatId}</code>`);
    }
    else if (text.startsWith('/check')) {
        const code = text.replace('/check', '').trim();
        if (!code) {
            return await sendTelegramMessage(chatId, `⚠️ Vui lòng nhập mã SKU hoặc Barcode.\nVí dụ: <code>/check 8935217400123</code>`);
        }
        await processLookup(chatId, code);
    }
    else if (text.length > 3) {
        // Fallback: try to look up as code if it looks like one
        await processLookup(chatId, text);
    }
}

async function handlePhoto(chatId: number, photoSizes: any[], isDocument: boolean = false) {
    // For photos, large photo is usually the last one. For documents, it's the object itself.
    const photo = isDocument ? photoSizes[0] : photoSizes[photoSizes.length - 1];
    const fileId = photo.file_id;

    await sendTelegramMessage(chatId, `🔄 <i>Đang phân tích barcode...</i>`);

    try {
        // 1. Get file path
        const fileData = await getTelegramFile(fileId);
        if (!fileData.ok || !fileData.result.file_path) {
            throw new Error('Không lấy được đường dẫn ảnh từ Telegram.');
        }

        // 2. Download
        const buffer = await downloadTelegramFile(fileData.result.file_path);
        if (!buffer) throw new Error('Không thể tải ảnh về server xử lý.');

        // 3. Decode Barcode
        const decodedCode = await decodeBarcodeFromBuffer(buffer);

        if (!decodedCode) {
            return await sendTelegramMessage(chatId, `❌ <b>Không đọc được mã vạch:</b>\n- Hãy chắc chắn ảnh rõ nét, không bị lóa.\n- Chụp gần mã vạch hơn (nên chiếm 50% khung hình).\n- Đảm bảo mã vạch nằm ngang hoặc dọc.`);
        }

        await sendTelegramMessage(chatId, `✅ Đã quét được mã: <code>${decodedCode}</code>`);
        await processLookup(chatId, decodedCode);

    } catch (error: any) {
        console.error('Photo processing error:', error);
        await sendTelegramMessage(chatId, `❌ <b>Lỗi xử lý:</b> ${error.message}`);
    }
}


async function processLookup(chatId: number, code: string) {
    try {
        const data = await getInventoryByBarcode(code);
        if (!data) {
            return await sendTelegramMessage(chatId, `❓ Không thấy thông tin sản phẩm cho mã: <b>${code}</b>`);
        }

        const formatted = formatInventoryResponse(data);
        await sendTelegramMessage(chatId, formatted);
    } catch (error: any) {
        await sendTelegramMessage(chatId, `❌ Lỗi tra cứu database: ${error.message}`);
    }
}

function formatInventoryResponse(data: any) {
    const { product, piece, bulk } = data;
    let text = `📦 <b>Sản phẩm:</b> ${product.sku}\n`;
    text += `🏷 <b>Tên:</b> ${product.name}\n`;
    if (product.barcode) text += `🔢 <b>Barcode:</b> <code>${product.barcode}</code>\n`;
    text += `\n📍 <b>Vị trí tồn kho:</b>\n`;

    if (piece.length === 0 && bulk.length === 0) {
        text += `❌ <i>Hiện tại hết hàng trong kho.</i>`;
        return text;
    }

    if (piece.length > 0) {
        text += `\n<b>[KHO LẺ]</b>\n`;
        piece.forEach((item: any) => {
            const loc = item.locations?.code || item.boxes?.locations?.code || '---';
            const box = item.boxes?.code ? `(Thùng: ${item.boxes.code})` : '';
            const qty = item.quantity;
            const avail = item.quantity - (item.allocated_quantity || 0);
            text += `- <b>${loc}</b>: ${qty} ${box} ${avail < qty ? `<i>(Duyệt ${qty - avail})</i>` : ''}\n`;
        });
    }

    if (bulk.length > 0) {
        text += `\n<b>[KHO SỈ]</b>\n`;
        bulk.forEach((item: any) => {
            const loc = item.boxes?.locations?.code || '---';
            const avail = item.quantity - (item.allocated_quantity || 0);
            text += `- <b>${loc}</b>: ${item.quantity} (Thùng: ${item.boxes.code})\n`;
        });
    }

    return text;
}
