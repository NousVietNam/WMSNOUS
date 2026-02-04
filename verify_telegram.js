// Node v18+ has built-in fetch


const TOKEN = '8120608586:AAE0uucBViozDMdc_O0HBFJzWmk5nHNMhUs';
const API_URL = `https://api.telegram.org/bot${TOKEN}`;

async function main() {
    console.log('--- Checking Bot Status ---');

    // 1. Get Me (Check Token)
    try {
        const meRes = await fetch(`${API_URL}/getMe`);
        const me = await meRes.json();

        if (!me.ok) {
            console.error('❌ Token Error:', me.description);
            return;
        }

        console.log(`✅ Bot Connected: @${me.result.username} (ID: ${me.result.id})`);
    } catch (err) {
        console.error('❌ Network Error:', err.message);
        return;
    }

    // 2. Get Updates (Find Chat ID)
    console.log('\n--- Checking for Recent Messages (to find Chat ID) ---');
    try {
        // Note: getUpdates conflicts with Webhook. If Webhook is set, getUpdates returns 409.
        // We should check webhook status first or handle the error.

        const updatesRes = await fetch(`${API_URL}/getUpdates`);
        const updates = await updatesRes.json();

        if (!updates.ok) {
            if (updates.description.includes('conflict')) {
                console.log('⚠️ Webhook is currently active. Cannot manually fetch updates.');
                console.log('To see Chat ID, please chat with the bot and check your server logs.');
            } else {
                console.error('❌ Updates Error:', updates.description);
            }
            return;
        }

        if (updates.result.length === 0) {
            console.log('⚠️ No recent messages found.');
            console.log('👉 Please open Telegram app, search for your bot, and click START or send a message "Hello".');
            console.log('👉 Then run this script again.');
        } else {
            console.log(`✅ Found ${updates.result.length} messages.`);
            const lastMsg = updates.result[updates.result.length - 1];
            if (lastMsg.message) {
                const chat = lastMsg.message.chat;
                console.log(`\n🎉 YOUR CHAT ID: ${chat.id}`);
                console.log(`User: ${chat.first_name} ${chat.last_name || ''} (@${chat.username})`);
                console.log(`Last text: "${lastMsg.message.text}"`);
            }
        }

    } catch (err) {
        console.error('❌ Error fetching updates:', err.message);
    }
}

main();
