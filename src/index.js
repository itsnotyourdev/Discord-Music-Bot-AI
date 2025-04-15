import 'dotenv/config';
import { Client, GatewayIntentBits, Collection } from 'discord.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readdirSync } from 'fs';
import { config } from './config/config.js';
import { serverService } from './services/serverService.js';
import { musicService } from './services/musicService.js';
import { monitoringService } from './services/monitoringService.js';
import { MessageHandler } from './handlers/messageHandler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

// Initialize collections
client.commands = new Collection();

// Load commands
const commandsPath = join(__dirname, 'commands');
const commandFiles = readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    const filePath = join(commandsPath, file);
    const fileUrl = new URL(`file://${filePath}`).href;
    const command = await import(fileUrl);
    if ('data' in command && 'execute' in command) {
        client.commands.set(command.data.name, command);
    }
}

// Initialize message handler
const messageHandler = new MessageHandler(client);

// Event: Bot is ready
client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}!`);
    console.log('Bot is ready!');
    
    // Initialize all servers the bot is in
    for (const guild of client.guilds.cache.values()) {
        await serverService.initializeServer(guild);
        console.log(`Initialized server: ${guild.name} (${guild.id})`);
    }

    // Set bot status
    client.user.setActivity('🎵 Music', { type: 'PLAYING' });
});

// Event: Bot joins a new server
client.on('guildCreate', async guild => {
    console.log(`Joined new server: ${guild.name} (${guild.id})`);
    await serverService.initializeServer(guild);
    
    // Find a suitable channel to send welcome message
    const defaultChannel = guild.systemChannel || guild.channels.cache.find(channel => 
        channel.type === 0 && channel.permissionsFor(guild.me).has('SEND_MESSAGES')
    );

    if (defaultChannel) {
        await defaultChannel.send({
            embeds: [serverService.createServerWelcomeEmbed(guild)]
        });
    }
});

// Event: Bot leaves a server
client.on('guildDelete', guild => {
    console.log(`Left server: ${guild.name} (${guild.id})`);
    // Clean up server data
    musicService.stop(guild.id);
    serverService.servers.delete(guild.id);
});

// Event: Message create
client.on('messageCreate', message => {
    messageHandler.handleMessage(message);
});

// Event: Interaction create
client.on('interactionCreate', async interaction => {
    if (!interaction.isCommand()) return;

    const command = client.commands.get(interaction.commandName);
    if (!command) return;

    try {
        // Track command execution
        monitoringService.trackCommand(interaction.commandName);
        await command.execute(interaction, client);
    } catch (error) {
        console.error(error);
        // Track error
        monitoringService.trackError(error.message);
        await interaction.reply({ 
            content: 'There was an error while executing this command!!', 
            ephemeral: true 
        });
    }
});

// Event: Voice state updates
client.on('voiceStateUpdate', async (oldState, newState) => {
    if (oldState.channelId && !newState.channelId) {
        // User left voice channel
        const queue = musicService.queues.get(oldState.guild.id);
        if (queue && queue.voiceChannel.id === oldState.channelId) {
            if (queue.voiceChannel.members.size === 1) {
                // Only bot is in the channel
                try {
                    if (queue.connection && queue.connection.state.status !== 'destroyed') {
                        queue.connection.destroy();
                    }
                } catch (error) {
                    console.error('Error destroying connection:', error);
                }
                musicService.queues.delete(oldState.guild.id);
                musicService.players.delete(oldState.guild.id);
                // Track voice connection end
                monitoringService.trackVoiceConnection(oldState.guild.id, false);
            }
        }
    } else if (!oldState.channelId && newState.channelId) {
        // User joined voice channel
        if (newState.member.id === client.user.id) {
            // Bot joined voice channel
            monitoringService.trackVoiceConnection(newState.guild.id, true);
        }
    }
});

// Update system metrics every minute
setInterval(() => {
    monitoringService.updateSystemMetrics();
}, 60000);

// Login to Discord
client.login(process.env.DISCORD_TOKEN); 