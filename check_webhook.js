
const dotenv = require('dotenv');
const path = require('path');
dotenv.config({ path: path.resolve(__dirname, '.env.local') });

const token = process.env.TELEGRAM_BOT_TOKEN || '8120608586:AAE0uucBViozDMdc_O0HBFJzWmk5nHNMhUs';

async function checkWebhook() {
    const url = `https://api.telegram.org/bot${token}/getWebhookInfo`;
    try {
        const response = await fetch(url);
        const data = await response.json();
        console.log('--- Current Webhook Info ---');
        console.log(JSON.stringify(data, null, 2));
    } catch (error) {
        console.error('Error fetching webhook info:', error);
    }
}

checkWebhook();
