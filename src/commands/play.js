import { SlashCommandBuilder } from 'discord.js';
import { config } from '../config/config.js';
import { PlayerService } from '../services/player.js';

export const data = new SlashCommandBuilder()
    .setName('play')
    .setDescription('Play a song or add it to the queue')
    .addStringOption(option =>
        option.setName('query')
            .setDescription('The song to play')
            .setRequired(true));

export async function execute(interaction) {
    const query = interaction.options.getString('query');
    const playerService = new PlayerService(interaction.guildId);
    
    try {
        await interaction.deferReply();
        const result = await playerService.play(interaction, query);
        await interaction.editReply(result);
    } catch (error) {
        console.error('Error in play command:', error);
        await interaction.editReply('There was an error playing the song.');
    }
} 