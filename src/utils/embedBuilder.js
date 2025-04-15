const { EmbedBuilder } = require('discord.js');
const config = require('../config/config');

class EmbedBuilderUtil {
    static createBasicEmbed(title, description, color = config.colors.default) {
        return new EmbedBuilder()
            .setTitle(title)
            .setDescription(description)
            .setColor(color)
            .setTimestamp();
    }

    static createMusicEmbed(song, action) {
        return new EmbedBuilder()
            .setTitle(`${config.emojis[action]} ${action.charAt(0).toUpperCase() + action.slice(1)}`)
            .setDescription(`**${song.title}**`)
            .setColor(config.colors.default)
            .setThumbnail(song.thumbnail)
            .addFields(
                { name: 'Duration', value: song.duration, inline: true },
                { name: 'Requested by', value: song.requestedBy, inline: true }
            )
            .setTimestamp();
    }

    static createQueueEmbed(queue) {
        const embed = new EmbedBuilder()
            .setTitle(`${config.emojis.queue} Queue`)
            .setColor(config.colors.default)
            .setTimestamp();

        if (queue.length === 0) {
            embed.setDescription('The queue is empty!');
            return embed;
        }

        const queueList = queue.slice(0, 10).map((song, index) => 
            `${index + 1}. ${song.title} - ${song.duration}`
        ).join('\n');

        embed.setDescription(queueList);
        
        if (queue.length > 10) {
            embed.setFooter({ text: `And ${queue.length - 10} more songs...` });
        }

        return embed;
    }

    static createErrorEmbed(error) {
        return new EmbedBuilder()
            .setTitle(`${config.emojis.error} Error`)
            .setDescription(error)
            .setColor(config.colors.error)
            .setTimestamp();
    }
}

module.exports = EmbedBuilderUtil; 