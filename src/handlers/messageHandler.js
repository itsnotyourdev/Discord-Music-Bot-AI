import { config } from '../config/config.js';
import { musicService } from '../services/musicService.js';
import { monitoringService } from '../services/monitoringService.js';

export class MessageHandler {
    constructor(client) {
        this.client = client;
        this.prefix = config.bot.prefix;
    }

    handleMessage(message) {
        // Ignore messages from bots
        if (message.author.bot) return;

        // Check if message starts with prefix
        if (!message.content.startsWith(this.prefix)) return;

        // Remove prefix and split into command and args
        const args = message.content.slice(this.prefix.length).trim().split(/ +/);
        const commandName = args.shift().toLowerCase();

        // Track command execution
        monitoringService.trackCommand(commandName);

        try {
            switch (commandName) {
                case 'play':
                case 'p':
                    this.handlePlay(message, args);
                    break;
                case 'skip':
                case 's':
                    this.handleSkip(message);
                    break;
                case 'stop':
                    this.handleStop(message);
                    break;
                case 'pause':
                    this.handlePause(message);
                    break;
                case 'resume':
                case 'r':
                    this.handleResume(message);
                    break;
                case 'queue':
                case 'q':
                    this.handleQueue(message);
                    break;
                case 'volume':
                case 'v':
                    this.handleVolume(message, args);
                    break;
                case 'help':
                    this.handleHelp(message);
                    break;
                default:
                    message.reply(`Unknown command. Use \`${this.prefix}help\` to see available commands.`);
            }
        } catch (error) {
            console.error('Error in message handler:', error);
            monitoringService.trackError(error.message);
            message.reply('There was an error executing that command.');
        }
    }

    async handlePlay(message, args) {
        if (!args.length) {
            return message.reply('Please provide a song name or URL.');
        }

        const query = args.join(' ');
        const result = await musicService.play(message, query);
        message.reply(`Added to queue: ${result.title}`);
    }

    async handleSkip(message) {
        musicService.skip(message.guild.id);
        message.reply('Skipped the current song.');
    }

    async handleStop(message) {
        musicService.stop(message.guild.id);
        message.reply('Stopped playback and cleared the queue.');
    }

    async handlePause(message) {
        musicService.pause(message.guild.id);
        message.reply('Paused playback.');
    }

    async handleResume(message) {
        musicService.resume(message.guild.id);
        message.reply('Resumed playback.');
    }

    async handleQueue(message) {
        const queue = musicService.getQueue(message.guild.id);
        if (!queue.length) {
            return message.reply('The queue is empty.');
        }

        const currentSong = musicService.getCurrentSong(message.guild.id);
        let queueList = currentSong ? `**Now Playing:** ${currentSong.title}\n\n` : '';
        
        queueList += queue.slice(0, 10).map((song, index) => 
            `${index + 1}. ${song.title} (Requested by: ${song.requestedBy})`
        ).join('\n');

        if (queue.length > 10) {
            queueList += `\n\n...and ${queue.length - 10} more songs`;
        }

        message.reply(queueList);
    }

    async handleVolume(message, args) {
        if (!args.length) {
            const queue = musicService.queues.get(message.guild.id);
            return message.reply(`Current volume: ${queue?.volume || config.player.defaultVolume}%`);
        }

        const volume = parseInt(args[0]);
        if (isNaN(volume) || volume < 0 || volume > 150) {
            return message.reply('Please provide a volume between 0 and 150.');
        }

        musicService.setVolume(message.guild.id, volume);
        message.reply(`Volume set to ${volume}%`);
    }

    async handleHelp(message) {
        const helpMessage = `
**Music Bot Commands**
\`${this.prefix}play <song>\` - Play a song or add it to the queue
\`${this.prefix}skip\` - Skip the current song
\`${this.prefix}stop\` - Stop playback and clear the queue
\`${this.prefix}pause\` - Pause playback
\`${this.prefix}resume\` - Resume playback
\`${this.prefix}queue\` - Show the current queue
\`${this.prefix}volume <0-150>\` - Set the volume
\`${this.prefix}help\` - Show this help message

**Aliases**
\`${this.prefix}p\` - Play
\`${this.prefix}s\` - Skip
\`${this.prefix}r\` - Resume
\`${this.prefix}q\` - Queue
\`${this.prefix}v\` - Volume
`;

        message.reply(helpMessage);
    }
} 