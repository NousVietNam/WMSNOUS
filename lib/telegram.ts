import { NextRequest, NextResponse } from 'next/server';

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_API_URL = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

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

/**
 * Send a text message to a chat
 */
export async function sendTelegramMessage(chatId: number | string, text: string, parseMode: 'Markdown' | 'HTML' = 'HTML') {
    if (!TELEGRAM_BOT_TOKEN) {
        console.warn('TELEGRAM_BOT_TOKEN is not set');
        return null;
    }

    try {
        const response = await fetch(`${TELEGRAM_API_URL}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                text: text,
                parse_mode: parseMode,
            }),
        });
        return await response.json();
    } catch (error) {
        console.error('Error sending Telegram message:', error);
        return null;
    }
}

/**
 * Set the Webhook URL for the bot
 */
export async function setTelegramWebhook(url: string, secretToken?: string) {
    if (!TELEGRAM_BOT_TOKEN) {
        throw new Error('TELEGRAM_BOT_TOKEN is not set');
    }

    const payload: any = { url: url };
    if (secretToken) {
        payload.secret_token = secretToken;
    }

    const response = await fetch(`${TELEGRAM_API_URL}/setWebhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });

    return await response.json();
}

/**
 * Get current Webhook info
 */
export async function getTelegramWebhookInfo() {
    if (!TELEGRAM_BOT_TOKEN) return null;
    const response = await fetch(`${TELEGRAM_API_URL}/getWebhookInfo`);
    return await response.json();
}
