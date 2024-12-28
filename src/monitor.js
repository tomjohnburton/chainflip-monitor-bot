const util = require('util');
const exec = util.promisify(require('child_process').exec);
const checkDiskSpace = require('check-disk-space').default;
const ValidatorMonitor = require('./validator-monitor');

class ChainflipMonitor {
    constructor(validatorId) {
        this.services = ['chainflip-node', 'chainflip-engine'];
        this.chainDataPath = '/etc/chainflip/chaindata';
        this.validatorMonitor = new ValidatorMonitor(validatorId);
    }

    async checkDiskSpace() {
        try {
            // Check Chainflip data directory specifically
            const info = await checkDiskSpace(this.chainDataPath);
            const total = info.size;
            const free = info.free;
            const used = total - free;
            const percentage = ((used / total) * 100).toFixed(2);
            
            // Get mount point information
            const { stdout: dfOutput } = await exec(`df -h ${this.chainDataPath}`);
            const mountInfo = dfOutput.split('\n')[1]; // Get the second line which contains the mount info
            const mountPoint = mountInfo.split(/\s+/)[5]; // Get the mount point
            
            return {
                percentage,
                free: (free / 1024 / 1024 / 1024).toFixed(2), // Convert to GB
                total: (total / 1024 / 1024 / 1024).toFixed(2), // Convert to GB
                mountPoint
            };
        } catch (error) {
            throw new Error(`Error checking Chainflip data directory space: ${error.message}`);
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
        const [diskInfo, validatorStatus] = await Promise.all([
            this.checkDiskSpace(),
            this.validatorMonitor.checkForChanges()
        ]);

        const serviceStatuses = await Promise.all(
            this.services.map(async (service) => {
                const isActive = await this.checkService(service);
                return `${service}: ${isActive ? '✅ Active' : '❌ Inactive'}`;
            })
        );

        return `📊 Daily Chainflip Validator Report\n\n` +
               `💾 Chainflip Data Directory (${diskInfo.mountPoint}):\n` +
               `Used: ${diskInfo.percentage}%\n` +
               `Free: ${diskInfo.free} GB\n` +
               `Total: ${diskInfo.total} GB\n\n` +
               `🔧 Services Status:\n${serviceStatuses.join('\n')}\n\n` +
               `${this.validatorMonitor.generateValidatorReport()}`;
    }

    async checkValidatorStatus() {
        return this.validatorMonitor.checkForChanges();
    }
}

module.exports = ChainflipMonitor; 