require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const schedule = require('node-schedule');
const ChainflipMonitor = require('./monitor');

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });
const monitor = new ChainflipMonitor();
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

// Send initial report on startup
console.log('Chainflip Monitor Bot starting...');
sendDailyReport()
    .then(() => console.log('Initial report sent'))
    .catch(error => console.error('Error sending initial report:', error));

// Schedule daily report at 9:00 AM
schedule.scheduleJob('0 9 * * *', sendDailyReport);

// Check alerts every 5 minutes
schedule.scheduleJob('*/5 * * * *', checkAlerts);

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