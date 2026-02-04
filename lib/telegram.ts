import { NextRequest, NextResponse } from 'next/server';

// Types for Telegram Objects (Simplified)
export type TelegramUpdate = {
    update_id: number;
    message?: TelegramMessage;
    callback_query?: TelegramCallbackQuery;
};

export type TelegramMessage = {
    message_id: number;
    from: TelegramUser;
    chat: TelegramChat;
    date: number;
    text?: string;
};

export type TelegramUser = {
    id: number;
    is_bot: boolean;
    first_name: string;
    username?: string;
};

export type TelegramChat = {
    id: number;
    type: string;
    title?: string;
};

export type TelegramCallbackQuery = {
    id: string;
    from: TelegramUser;
    message?: TelegramMessage;
    data: string;
};

// --- CORE FUNCTIONS ---

const getBotToken = () => {
    return process.env.TELEGRAM_BOT_TOKEN || '8120608586:AAE0uucBViozDMdc_O0HBFJzWmk5nHNMhUs';
};

/**
 * Send a text message to a chat
 */
export async function sendTelegramMessage(chatId: number | string, text: string, parseMode: 'Markdown' | 'HTML' = 'HTML') {
    const token = getBotToken();
    if (!token) {
        console.error('❌ TELEGRAM_BOT_TOKEN is missing');
        return { ok: false, description: 'Missing Token' };
    }

    const url = `https://api.telegram.org/bot${token}/sendMessage`;

    try {
        const body = JSON.stringify({
            chat_id: chatId,
            text: text,
            parse_mode: parseMode,
        });

        console.log(`🚀 Sending Telegram to ${chatId} via ${url.replace(token, '******')}`);

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: body,
            cache: 'no-store' // Ensure no caching
        });

        const data = await response.json();
        console.log('✅ Telegram Response:', data);
        return data;
    } catch (error: any) {
        console.error('❌ Error sending Telegram message:', error);
        return { ok: false, description: error.message };
    }
}

/**
 * Set the Webhook URL for the bot
 */
export async function setTelegramWebhook(url: string, secretToken?: string) {
    const token = getBotToken();
    if (!token) throw new Error('TELEGRAM_BOT_TOKEN is not set');

    const payload: any = { url: url };
    if (secretToken) {
        payload.secret_token = secretToken;
    }

    const response = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        cache: 'no-store'
    });

    return await response.json();
}

/**
 * Get current Webhook info
 */
export async function getTelegramWebhookInfo() {
    const token = getBotToken();
    if (!token) return null;
    const response = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`, { cache: 'no-store' });
    return await response.json();
}
