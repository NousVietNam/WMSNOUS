import { NextRequest, NextResponse } from 'next/server';
import { sendTelegramMessage, TelegramUpdate, getTelegramFile, downloadTelegramFile } from '@/lib/telegram';
import { decodeBarcodeFromBuffer } from '@/lib/barcode-service';
import { smartLookup } from '@/lib/inventory-service';

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
        await sendTelegramMessage(chatId, `👋 <b>Xin chào!</b>\nTôi là Bot Quản Lý Kho (WMS) Pro.\n\n🛡 <b>Tính năng mới:</b>\n1. 📸 Gửi ảnh Barcode để tra cứu mọi thứ.\n2. 📦 /box [Mã Thùng] - Xem ruột thùng.\n3. 📍 /where [Mã Vị Trí] - Xem vị trí có gì.\n4. 🔍 /check [Mã SP] - Tra cứu tồn SP.\n\nGõ /help để xem chi tiết.`);
    }
    else if (text.startsWith('/help')) {
        await sendTelegramMessage(chatId, `🛠 <b>Danh sách lệnh:</b>\n\n📦 /box [Mã Thùng] - Kiểm tra hàng trong thùng\n📍 /where [Mã Vị Trí] - Kiểm tra vị trí đang chứa gì\n🔍 /check [SKU/Barcode] - Tra cứu tồn kho sản phẩm\n🆔 /myid - Xem Chat ID của bạn\n📸 <i>Gửi ảnh Barcode để tra cứu nhanh</i>`);
    }
    else if (text.startsWith('/myid')) {
        await sendTelegramMessage(chatId, `🆔 Chat ID của bạn là: <code>${chatId}</code>`);
    }
    else if (text.startsWith('/box')) {
        const code = text.replace('/box', '').trim();
        if (!code) return await sendTelegramMessage(chatId, `⚠️ Vui lòng nhập mã thùng.\nVí dụ: <code>/box BOX-001</code>`);
        await processLookup(chatId, code);
    }
    else if (text.startsWith('/where')) {
        const code = text.replace('/where', '').trim();
        if (!code) return await sendTelegramMessage(chatId, `⚠️ Vui lòng nhập mã vị trí.\nVí dụ: <code>/where A-01-01</code>`);
        await processLookup(chatId, code);
    }
    else if (text.startsWith('/check')) {
        const code = text.replace('/check', '').trim();
        if (!code) return await sendTelegramMessage(chatId, `⚠️ Vui lòng nhập mã sản phẩm.\nVí dụ: <code>/check PRODUCT-A</code>`);
        await processLookup(chatId, code);
    }
    else if (text.length > 3) {
        // Fallback or just plain text lookup
        await processLookup(chatId, text);
    }
}

async function handlePhoto(chatId: number, photoSizes: any[], isDocument: boolean = false) {
    const photo = isDocument ? photoSizes[0] : photoSizes[photoSizes.length - 1];
    const fileId = photo.file_id;

    await sendTelegramMessage(chatId, `🔄 <i>Đang phân tích barcode...</i>`);

    try {
        const fileData = await getTelegramFile(fileId);
        if (!fileData.ok || !fileData.result.file_path) throw new Error('Telegram error');

        const buffer = await downloadTelegramFile(fileData.result.file_path);
        if (!buffer) throw new Error('Download error');

        const decodedCode = await decodeBarcodeFromBuffer(buffer);
        if (!decodedCode) {
            return await sendTelegramMessage(chatId, `❌ <b>Không đọc được mã vạch:</b> Vui lòng chụp rõ nét và đủ sáng nhé.`);
        }

        await sendTelegramMessage(chatId, `✅ Quét được: <code>${decodedCode}</code>`);
        await processLookup(chatId, decodedCode);
    } catch (error: any) {
        await sendTelegramMessage(chatId, `❌ Lỗi xử lý ảnh: ${error.message}`);
    }
}

async function processLookup(chatId: number, code: string) {
    try {
        const data = await smartLookup(code);
        if (!data) {
            return await sendTelegramMessage(chatId, `❓ Không thấy thông tin cho mã: <b>${code}</b>`);
        }

        let response = '';
        if (data.type === 'PRODUCT') response = formatProductResponse(data);
        else if (data.type === 'BOX') response = formatBoxResponse(data);
        else if (data.type === 'LOCATION') response = formatLocationResponse(data);

        await sendTelegramMessage(chatId, response);
    } catch (error: any) {
        await sendTelegramMessage(chatId, `❌ Lỗi tra cứu: ${error.message}`);
    }
}

function formatProductResponse(data: any) {
    const { product, piece, bulk } = data;
    let text = `📦 <b>Sản phẩm:</b> ${product.sku}\n`;
    text += `🏷 <b>Tên:</b> ${product.name}\n`;
    text += `\n📍 <b>Vị trí tồn kho:</b>\n`;

    if (piece.length === 0 && bulk.length === 0) {
        text += `❌ <i>Hiện tại hết hàng trong kho.</i>`;
        return text;
    }

    if (piece.length > 0) {
        text += `\n<b>[KHO LẺ]</b>\n`;
        piece.forEach((item: any) => {
            const loc = (item.locations?.code || item.boxes?.locations?.code || '---');
            const box = item.boxes?.code ? `(Thùng: ${item.boxes.code})` : '';
            const avail = item.quantity - (item.allocated_quantity || 0);
            text += `- <b>${loc}</b>: ${avail}/${item.quantity} ${box}\n`;
        });
    }

    if (bulk.length > 0) {
        text += `\n<b>[KHO SỈ]</b>\n`;
        bulk.forEach((item: any) => {
            const loc = (item.boxes?.locations?.code || '---');
            const avail = item.quantity - (item.allocated_quantity || 0);
            text += `- <b>${loc}</b>: ${avail}/${item.quantity} (Thùng: ${item.boxes.code})\n`;
        });
    }
    return text;
}

function formatBoxResponse(data: any) {
    const { box, items, bulk } = data;
    let text = `🗳 <b>Thùng:</b> <code>${box.code}</code>\n`;
    text += `📍 <b>Vị trí:</b> <b>${box.locations?.code || '---'}</b>\n`;
    text += `📊 <b>Trạng thái:</b> ${box.status}\n`;
    text += `\n📦 <b>Danh sách hàng:</b>\n`;

    if (items.length === 0 && bulk.length === 0) {
        text += `<i>(Thùng rỗng)</i>`;
        return text;
    }

    [...items, ...bulk].forEach((item: any) => {
        const avail = item.quantity - (item.allocated_quantity || 0);
        text += `- <b>${item.products.sku}</b>: ${avail}/${item.quantity}\n`;
    });

    return text;
}

function formatLocationResponse(data: any) {
    const { location, boxes, looseItems } = data;
    let text = `📍 <b>Vị trí:</b> <code>${location.code}</code>\n`;
    if (location.zone) text += `🗺 <b>Vùng:</b> ${location.zone}\n`;
    text += `\n📥 <b>Đang chứa:</b>\n`;

    if (boxes.length === 0 && looseItems.length === 0) {
        text += `<i>(Vị trí trống)</i>`;
        return text;
    }

    if (boxes.length > 0) {
        text += `\n<b>[THÙNG HÀNG]</b>\n`;
        boxes.forEach((b: any) => {
            text += `- Thùng: <code>${b.code}</code> (${b.status})\n`;
        });
    }

    if (looseItems.length > 0) {
        text += `\n<b>[HÀNG LẺ]</b>\n`;
        looseItems.forEach((item: any) => {
            text += `- ${item.products.sku}: ${item.quantity}\n`;
        });
    }

    return text;
}
