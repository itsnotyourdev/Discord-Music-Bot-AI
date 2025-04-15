import { SlashCommandBuilder } from 'discord.js';
import { serverService } from '../services/serverService.js';

export const data = new SlashCommandBuilder()
    .setName('stats')
    .setDescription('Show server statistics and bot information');

export async function execute(interaction) {
    try {
        const embed = serverService.createServerStatsEmbed(interaction.guild);
        await interaction.reply({ embeds: [embed] });
    } catch (error) {
        console.error(error);
        await interaction.reply({ 
            content: 'There was an error while fetching server stats!', 
            ephemeral: true 
        });
    }
} 