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

    async getServiceStatus(service, full = false) {
        try {
            let command = full 
                ? `systemctl status ${service}` 
                : `systemctl status ${service} --no-pager --lines=10`;
            
            const { stdout } = await exec(command);
            // Trim the output to fit Telegram's message limit (4096 characters)
            return stdout.length > 3800 
                ? stdout.slice(0, 3800) + '\n... (truncated)'
                : stdout;
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

    async restartService(service) {
        try {
            if (!this.services.includes(service)) {
                throw new Error('Invalid service name');
            }

            await exec(`systemctl restart ${service}`);
            
            // Wait a moment and check the status
            await new Promise(resolve => setTimeout(resolve, 2000));
            const isActive = await this.checkService(service);
            
            if (isActive) {
                // Get brief status after successful restart
                const status = await this.getServiceStatus(service, false);
                return `✅ ${service} has been restarted successfully\n\nStatus:\n${status}`;
            } else {
                // Get brief status if service failed to start
                const status = await this.getServiceStatus(service, false);
                return `⚠️ ${service} restart completed but service is not active.\n\nStatus:\n${status}`;
            }
        } catch (error) {
            throw new Error(`Failed to restart ${service}: ${error.message}`);
        }
    }

    async getServiceLogs(service) {
        try {
            if (!this.services.includes(service)) {
                throw new Error('Invalid service name');
            }

            // Get last 20 lines of logs
            const { stdout } = await exec(`journalctl -u ${service} -n 20 --no-pager`);
            
            // Format logs for Telegram and ensure it's not too long
            const formattedLogs = stdout
                .split('\n')
                .map(line => line.trim())
                .join('\n')
                .slice(0, 3800); // Ensure we don't exceed Telegram's limit

            return `📜 Last 20 lines of ${service} logs:\n\n<pre>${formattedLogs}</pre>`;
        } catch (error) {
            throw new Error(`Failed to get logs for ${service}: ${error.message}`);
        }
    }
}

module.exports = ChainflipMonitor; 