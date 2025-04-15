import { SlashCommandBuilder } from 'discord.js';
import { PlayerService } from '../services/player.js';

export const data = new SlashCommandBuilder()
    .setName('skip')
    .setDescription('Skip the current song');

export async function execute(interaction) {
    const playerService = new PlayerService(interaction.guildId);
    
    try {
        await interaction.deferReply();
        const result = await playerService.skip(interaction);
        await interaction.editReply(result);
    } catch (error) {
        console.error('Error in skip command:', error);
        await interaction.editReply('There was an error skipping the song.');
    }
} 