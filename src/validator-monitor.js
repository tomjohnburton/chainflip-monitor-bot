const fetch = require('node-fetch');

class ValidatorMonitor {
    constructor(validatorId) {
        this.validatorId = validatorId;
        this.lastStatus = null;
        this.lastReputation = null;
    }

    calculateTotalBalance(locked, unlocked) {
        // Convert from Wei-like to FLIP (divide by 10^18)
        const total = (BigInt(locked) + BigInt(unlocked));
        return Number(total) / Math.pow(10, 18);
    }

    async fetchValidatorStatus() {
        try {
            const response = await fetch("https://cache-service.chainflip.io/graphql", {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    query: `query GetValidatorByIdSs58($validatorId: String!) {
                        validators: allValidators(condition: {idSs58: $validatorId}) {
                            nodes {
                                idSs58
                                alias
                                apyBp
                                isCurrentAuthority
                                isCurrentBackup
                                isQualified
                                isOnline
                                isBidding
                                isKeyholder
                                reputationPoints
                                lockedBalance
                                unlockedBalance
                            }
                        }
                    }`,
                    variables: {
                        validatorId: this.validatorId
                    }
                })
            });

            const data = await response.json();
            return data.data.validators.nodes[0];
        } catch (error) {
            throw new Error(`Error fetching validator status: ${error.message}`);
        }
    }

    async checkForChanges() {
        const currentStatus = await this.fetchValidatorStatus();
        const alerts = [];

        if (this.lastStatus) {
            // Check for boolean status changes
            const booleanFields = ['isCurrentAuthority', 'isCurrentBackup', 'isQualified', 
                                 'isOnline', 'isBidding', 'isKeyholder'];
            
            for (const field of booleanFields) {
                if (this.lastStatus[field] !== currentStatus[field]) {
                    alerts.push(`⚠️ ${field} changed from ${this.lastStatus[field]} to ${currentStatus[field]}`);
                }
            }

            // Check reputation changes
            const lastRep = this.lastStatus.reputationPoints;
            const currentRep = currentStatus.reputationPoints;

            if (lastRep >= 0 && currentRep < 0) {
                alerts.push(`🚨 Reputation turned negative! Current: ${currentRep}`);
            }

            if (currentRep < 2500 && lastRep >= 2500) {
                alerts.push(`🚨 Reputation fell below 2500! Current: ${currentRep}`);
            }

            // Check balance changes
            const lastTotal = this.calculateTotalBalance(
                this.lastStatus.lockedBalance, 
                this.lastStatus.unlockedBalance
            );
            const currentTotal = this.calculateTotalBalance(
                currentStatus.lockedBalance, 
                currentStatus.unlockedBalance
            );

            // Calculate percentage change
            const change = lastTotal - currentTotal;
            const percentageChange = (change / lastTotal) * 100;

            // Alert only if decrease is more than 1%
            if (currentTotal < lastTotal && percentageChange > 1) {
                alerts.push(`💰 Significant balance decrease detected!\n` +
                           `Previous: ${lastTotal.toFixed(2)} FLIP\n` +
                           `Current: ${currentTotal.toFixed(2)} FLIP\n` +
                           `Change: -${change.toFixed(2)} FLIP (-${percentageChange.toFixed(2)}%)`);
            }
        }

        this.lastStatus = currentStatus;
        return {
            alerts,
            status: currentStatus
        };
    }

    generateValidatorReport() {
        if (!this.lastStatus) return 'No validator data available';

        const totalBalance = this.calculateTotalBalance(
            this.lastStatus.lockedBalance,
            this.lastStatus.unlockedBalance
        );

        return `🏷️ Validator: ${this.lastStatus.alias} (${this.lastStatus.idSs58.slice(0, 8)}...)\n` +
               `📈 APY: ${this.lastStatus.apyBp/100}%\n` +
               `🏆 Reputation: ${this.lastStatus.reputationPoints}\n` +
               `💰 Total Balance: ${totalBalance.toFixed(2)} FLIP\n` +
               `  • Locked: ${(Number(this.lastStatus.lockedBalance) / Math.pow(10, 18)).toFixed(2)} FLIP\n` +
               `  • Unlocked: ${(Number(this.lastStatus.unlockedBalance) / Math.pow(10, 18)).toFixed(2)} FLIP\n` +
               `\n🔐 Status:\n` +
               `Authority: ${this.lastStatus.isCurrentAuthority ? '✅' : '❌'}\n` +
               `Backup: ${this.lastStatus.isCurrentBackup ? '✅' : '❌'}\n` +
               `Qualified: ${this.lastStatus.isQualified ? '✅' : '❌'}\n` +
               `Online: ${this.lastStatus.isOnline ? '✅' : '❌'}\n` +
               `Bidding: ${this.lastStatus.isBidding ? '✅' : '❌'}\n` +
               `Keyholder: ${this.lastStatus.isKeyholder ? '✅' : '❌'}\n`;
    }
}

module.exports = ValidatorMonitor; 