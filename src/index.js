require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const schedule = require('node-schedule');
const ChainflipMonitor = require('./monitor');

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });
const monitor = new ChainflipMonitor(process.env.VALIDATOR_ID);
const CHAT_ID = process.env.CHAT_ID;
const DISK_THRESHOLD = process.env.DISK_THRESHOLD || 5;

async function sendMessage(message) {
    try {
        await bot.sendMessage(CHAT_ID, message, { parse_mode: 'HTML' });
    } catch (error) {
        console.error('Error sending message:', error);
    }
}

async function checkAlerts() {
    try {
        // Check disk space
        const diskInfo = await monitor.checkDiskSpace();
        if (parseFloat(diskInfo.percentage) > (100 - DISK_THRESHOLD)) {
            await sendMessage(`⚠️ ALERT: Low disk space! ${diskInfo.free}GB (${diskInfo.percentage}%) remaining`);
        }

        // Check services
        for (const service of monitor.services) {
            const isActive = await monitor.checkService(service);
            if (!isActive) {
                const status = await monitor.getServiceStatus(service);
                await sendMessage(`🚨 ALERT: ${service} is not active!\n\nStatus:\n${status}`);
            }
        }
    } catch (error) {
        console.error('Error checking alerts:', error);
    }
}

async function sendDailyReport() {
    try {
        const report = await monitor.generateDailyReport();
        await sendMessage(report);
    } catch (error) {
        console.error('Error sending daily report:', error);
    }
}

// Add validator status check
async function checkValidatorStatus() {
    try {
        const { alerts } = await monitor.checkValidatorStatus();
        if (alerts.length > 0) {
            await sendMessage(alerts.join('\n'));
        }
    } catch (error) {
        console.error('Error checking validator status:', error);
    }
}

// Schedule validator checks every 5 minutes
schedule.scheduleJob('*/5 * * * *', checkValidatorStatus);

// For negative reputation, check every 2 hours
schedule.scheduleJob('0 */2 * * *', async () => {
    try {
        const { status } = await monitor.checkValidatorStatus();
        if (status.reputationPoints < 0) {
            await sendMessage(`⚠️ Reminder: Reputation is still negative (${status.reputationPoints})`);
        }
    } catch (error) {
        console.error('Error checking reputation:', error);
    }
});

// Send initial report on startup
console.log('Chainflip Monitor Bot starting...');
sendDailyReport()
    .then(() => console.log('Initial report sent'))
    .catch(error => console.error('Error sending initial report:', error));

// Schedule daily report at 9:00 AM
schedule.scheduleJob('0 9 * * *', sendDailyReport);

// Check alerts every 5 minutes
schedule.scheduleJob('*/5 * * * *', checkAlerts);

// Command handler for /actions
bot.onText(/\/actions/, async (msg) => {
    // Only respond to authorized users
    if (msg.chat.id.toString() !== CHAT_ID) {
        return;
    }

    const options = {
        reply_markup: {
            inline_keyboard: [
                [
                    { text: '🔄 Restart Node', callback_data: 'restart_node' },
                    { text: '🔄 Restart Engine', callback_data: 'restart_engine' }
                ],
                [
                    { text: '📜 Node Logs', callback_data: 'logs_node' },
                    { text: '📜 Engine Logs', callback_data: 'logs_engine' }
                ]
            ]
        }
    };

    await bot.sendMessage(msg.chat.id, 'Choose an action:', options);
});

// Handle button callbacks
bot.on('callback_query', async (callbackQuery) => {
    const chatId = callbackQuery.message.chat.id;
    
    // Only respond to authorized users
    if (chatId.toString() !== CHAT_ID) {
        return;
    }

    const action = callbackQuery.data;
    let response = '';

    try {
        switch (action) {
            case 'restart_node':
                response = await monitor.restartService('chainflip-node');
                break;
            case 'restart_engine':
                response = await monitor.restartService('chainflip-engine');
                break;
            case 'logs_node':
                response = await monitor.getServiceLogs('chainflip-node');
                break;
            case 'logs_engine':
                response = await monitor.getServiceLogs('chainflip-engine');
                break;
        }

        // Answer the callback query to remove the loading state
        await bot.answerCallbackQuery(callbackQuery.id);
        
        // Send the response
        await bot.sendMessage(chatId, response, { parse_mode: 'HTML' });
    } catch (error) {
        console.error('Error handling callback:', error);
        await bot.answerCallbackQuery(callbackQuery.id, { text: 'Error executing command' });
        await bot.sendMessage(chatId, `Error: ${error.message}`);
    }
});

console.log('Chainflip Monitor Bot started');

// Export functions for testing
module.exports = {
    sendDailyReport,
    checkAlerts,
    sendMessage
};

bot.on('message', (msg) => {
    console.log('Chat ID:', msg.chat.id);
}); 