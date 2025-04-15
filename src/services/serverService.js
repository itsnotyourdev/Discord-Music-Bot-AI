import { EmbedBuilder } from 'discord.js';
import { config } from '../config/config.js';

class ServerService {
    constructor() {
        this.servers = new Map();
    }

    async initializeServer(guild) {
        const serverInfo = {
            id: guild.id,
            name: guild.name,
            memberCount: guild.memberCount,
            ownerId: guild.ownerId,
            joinedAt: new Date(),
            musicChannel: null,
            prefix: config.bot.prefix
        };

        this.servers.set(guild.id, serverInfo);
        return serverInfo;
    }

    getServerInfo(guildId) {
        return this.servers.get(guildId);
    }

    setMusicChannel(guildId, channelId) {
        const server = this.servers.get(guildId);
        if (server) {
            server.musicChannel = channelId;
        }
    }

    createServerWelcomeEmbed(guild) {
        return new EmbedBuilder()
            .setTitle('🎵 Music Bot Joined Server')
            .setDescription(`Hello ${guild.name}! I'm ready to play some music!`)
            .setColor(config.colors.success)
            .addFields(
                { name: 'Server ID', value: guild.id, inline: true },
                { name: 'Member Count', value: guild.memberCount.toString(), inline: true },
                { name: 'Owner', value: `<@${guild.ownerId}>`, inline: true }
            )
            .setThumbnail(guild.iconURL())
            .setTimestamp();
    }

    createServerStatsEmbed(guild) {
        const server = this.getServerInfo(guild.id);
        return new EmbedBuilder()
            .setTitle('📊 Server Stats')
            .setColor(config.colors.default)
            .addFields(
                { name: 'Server Name', value: guild.name, inline: true },
                { name: 'Server ID', value: guild.id, inline: true },
                { name: 'Member Count', value: guild.memberCount.toString(), inline: true },
                { name: 'Bot Prefix', value: server?.prefix || config.bot.prefix, inline: true },
                { name: 'Music Channel', value: server?.musicChannel ? `<#${server.musicChannel}>` : 'Not set', inline: true },
                { name: 'Bot Joined', value: server?.joinedAt.toLocaleString(), inline: true }
            )
            .setThumbnail(guild.iconURL())
            .setTimestamp();
    }
}

const serverService = new ServerService();
export { serverService }; 