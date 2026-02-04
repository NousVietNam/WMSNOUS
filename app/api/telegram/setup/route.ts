import { NextRequest, NextResponse } from 'next/server';
import { setTelegramWebhook, getTelegramWebhookInfo } from '@/lib/telegram';

export async function GET(req: NextRequest) {
    // Security: Only allow running this if a special query param is present or we are in dev mode
    // For simplicity now, we check for a custom secret query param just to prevent public spamming if exposed
    // Usage: /api/telegram/setup?url=https://your-domain.com&secret=YOUR_ENV_SECRET

    const { searchParams } = new URL(req.url);
    const url = searchParams.get('url');
    const secret = searchParams.get('secret');

    const envSecret = process.env.TELEGRAM_WEBHOOK_SECRET;

    if (!url) {
        // Just get info
        const info = await getTelegramWebhookInfo();
        return NextResponse.json({
            info,
            message: "To set webhook, pass ?url=YOUR_HTTPS_URL&secret=YOUR_TELEGRAM_SECRET"
        });
    }

    // If secret is configured in env, we require it to match
    if (envSecret && secret !== envSecret) {
        return NextResponse.json({ error: "Invalid Secret" }, { status: 401 });
    }

    // Construct full Webhook URL (append the route)
    // Ensure the user provided the base domain or the full path. 
    // We assume the user provides the BASE DOMAIN or the Full URL. 
    // Let's assume user gives "https://myapp.vercel.app". We append "/api/telegram/webhook".

    let targetUrl = url;
    if (!targetUrl.includes('/api/telegram/webhook')) {
        targetUrl = `${url.replace(/\/$/, '')}/api/telegram/webhook`;
    }

    try {
        const result = await setTelegramWebhook(targetUrl, envSecret || undefined);
        return NextResponse.json({
            success: true,
            targetUrl,
            telegramResponse: result
        });
    } catch (err: any) {
        return NextResponse.json({ success: false, error: err.message }, { status: 500 });
    }
}
