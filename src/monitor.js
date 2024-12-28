const util = require('util');
const exec = util.promisify(require('child_process').exec);
const checkDiskSpace = require('check-disk-space').default;

class ChainflipMonitor {
    constructor() {
        this.services = ['chainflip-node', 'chainflip-engine'];
    }

    async checkDiskSpace() {
        try {
            const info = await checkDiskSpace('/');
            const total = info.size;
            const free = info.free;
            const used = total - free;
            const percentage = ((used / total) * 100).toFixed(2);
            
            return {
                percentage,
                free: (free / 1024 / 1024 / 1024).toFixed(2), // Convert to GB
                total: (total / 1024 / 1024 / 1024).toFixed(2) // Convert to GB
            };
        } catch (error) {
            throw new Error(`Error checking disk space: ${error.message}`);
        }
    }

    async checkService(service) {
        try {
            const { stdout } = await exec(`systemctl is-active ${service}`);
            return stdout.trim() === 'active';
        } catch (error) {
            return false;
        }
    }

    async getServiceStatus(service) {
        try {
            const { stdout } = await exec(`systemctl status ${service}`);
            return stdout;
        } catch (error) {
            return `Error getting ${service} status: ${error.message}`;
        }
    }

    async generateDailyReport() {
        const diskInfo = await this.checkDiskSpace();
        const serviceStatuses = await Promise.all(
            this.services.map(async (service) => {
                const isActive = await this.checkService(service);
                return `${service}: ${isActive ? '✅ Active' : '❌ Inactive'}`;
            })
        );

        return `📊 Daily Chainflip Validator Report\n\n` +
               `💾 Disk Space:\n` +
               `Used: ${diskInfo.percentage}%\n` +
               `Free: ${diskInfo.free} GB\n` +
               `Total: ${diskInfo.total} GB\n\n` +
               `🔧 Services Status:\n${serviceStatuses.join('\n')}`;
    }
}

module.exports = ChainflipMonitor; 