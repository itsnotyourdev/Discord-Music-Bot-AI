import { EmbedBuilder } from 'discord.js';
import { config } from '../config/config.js';

class MonitoringService {
    constructor() {
        this.metrics = {
            commandsExecuted: new Map(), // command name -> count
            errors: new Map(), // error type -> count
            voiceConnections: new Map(), // guildId -> connection time
            memoryUsage: [],
            cpuUsage: [],
            uptime: Date.now()
        };
    }

    trackCommand(commandName) {
        const count = this.metrics.commandsExecuted.get(commandName) || 0;
        this.metrics.commandsExecuted.set(commandName, count + 1);
    }

    trackError(errorType) {
        const count = this.metrics.errors.get(errorType) || 0;
        this.metrics.errors.set(errorType, count + 1);
    }

    trackVoiceConnection(guildId, connected = true) {
        if (connected) {
            this.metrics.voiceConnections.set(guildId, Date.now());
        } else {
            this.metrics.voiceConnections.delete(guildId);
        }
    }

    updateSystemMetrics() {
        const memoryUsage = process.memoryUsage();
        this.metrics.memoryUsage.push({
            timestamp: Date.now(),
            heapUsed: memoryUsage.heapUsed,
            heapTotal: memoryUsage.heapTotal,
            external: memoryUsage.external
        });

        // Keep only last 100 measurements
        if (this.metrics.memoryUsage.length > 100) {
            this.metrics.memoryUsage.shift();
        }
    }

    getCommandStats() {
        return Array.from(this.metrics.commandsExecuted.entries())
            .map(([command, count]) => ({ command, count }))
            .sort((a, b) => b.count - a.count);
    }

    getErrorStats() {
        return Array.from(this.metrics.errors.entries())
            .map(([error, count]) => ({ error, count }))
            .sort((a, b) => b.count - a.count);
    }

    getVoiceConnectionStats() {
        return Array.from(this.metrics.voiceConnections.entries())
            .map(([guildId, startTime]) => ({
                guildId,
                duration: Math.floor((Date.now() - startTime) / 1000) // in seconds
            }));
    }

    getSystemStats() {
        const memoryUsage = process.memoryUsage();
        const uptime = Math.floor(process.uptime());
        
        return {
            memory: {
                heapUsed: this.formatBytes(memoryUsage.heapUsed),
                heapTotal: this.formatBytes(memoryUsage.heapTotal),
                external: this.formatBytes(memoryUsage.external)
            },
            uptime: this.formatUptime(uptime),
            voiceConnections: this.metrics.voiceConnections.size
        };
    }

    createMonitoringEmbed() {
        const systemStats = this.getSystemStats();
        const commandStats = this.getCommandStats();
        const errorStats = this.getErrorStats();

        const embed = new EmbedBuilder()
            .setTitle('🤖 Bot Monitoring Dashboard')
            .setColor(config.colors.default)
            .setTimestamp()
            .addFields(
                {
                    name: 'System Status',
                    value: `🕒 Uptime: ${systemStats.uptime}\n` +
                           `🎵 Voice Connections: ${systemStats.voiceConnections}\n` +
                           `💾 Memory Usage: ${systemStats.memory.heapUsed} / ${systemStats.memory.heapTotal}\n` +
                           `📦 External Memory: ${systemStats.memory.external}`,
                    inline: false
                },
                {
                    name: 'Top Commands',
                    value: commandStats.slice(0, 5)
                        .map(stat => `\`${stat.command}\`: ${stat.count} uses`)
                        .join('\n') || 'No commands executed yet',
                    inline: true
                },
                {
                    name: 'Recent Errors',
                    value: errorStats.slice(0, 5)
                        .map(stat => `\`${stat.error}\`: ${stat.count} times`)
                        .join('\n') || 'No errors recorded',
                    inline: true
                }
            );

        return embed;
    }

    formatBytes(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    formatUptime(seconds) {
        const days = Math.floor(seconds / 86400);
        const hours = Math.floor((seconds % 86400) / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;

        return `${days}d ${hours}h ${minutes}m ${secs}s`;
    }
}

const monitoringService = new MonitoringService();
export { monitoringService }; 