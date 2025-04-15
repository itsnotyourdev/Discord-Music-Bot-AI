import { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus } from '@discordjs/voice';
import ytdl from 'ytdl-core';
import { config } from '../config/config.js';

export class PlayerService {
    constructor(guildId) {
        this.guildId = guildId;
        this.queues = new Map();
        this.players = new Map();
    }

    async play(interaction, query) {
        const member = interaction.member;
        const voiceChannel = member.voice.channel;

        if (!voiceChannel) {
            throw new Error('You need to be in a voice channel to play music!');
        }

        // Initialize queue if it doesn't exist
        if (!this.queues.has(this.guildId)) {
            this.queues.set(this.guildId, {
                voiceChannel,
                connection: null,
                songs: [],
                playing: false,
                volume: config.player.defaultVolume,
                loop: false,
                shuffle: false
            });
        }

        const queue = this.queues.get(this.guildId);

        // Check if the URL is valid
        let song;
        if (ytdl.validateURL(query)) {
            const songInfo = await ytdl.getInfo(query);
            song = {
                title: songInfo.videoDetails.title,
                url: songInfo.videoDetails.video_url,
                duration: parseInt(songInfo.videoDetails.lengthSeconds),
                thumbnail: songInfo.videoDetails.thumbnails[0].url,
                requestedBy: interaction.user.tag
            };
        } else {
            throw new Error('Please provide a valid YouTube URL!');
        }

        queue.songs.push(song);

        // Join voice channel if not already connected
        if (!queue.connection) {
            const connection = joinVoiceChannel({
                channelId: voiceChannel.id,
                guildId: interaction.guild.id,
                adapterCreator: interaction.guild.voiceAdapterCreator,
            });

            queue.connection = connection;
            const player = createAudioPlayer();
            this.players.set(this.guildId, player);
            connection.subscribe(player);

            player.on('stateChange', (oldState, newState) => {
                if (newState.status === AudioPlayerStatus.Idle && oldState.status !== AudioPlayerStatus.Idle) {
                    this.handleSongEnd(interaction, queue);
                }
            });
        }

        // Play the song if not already playing
        if (!queue.playing) {
            await this.playSong(interaction, queue);
        }

        return song;
    }

    async playSong(interaction, queue) {
        if (queue.songs.length === 0) {
            queue.connection.destroy();
            this.queues.delete(this.guildId);
            this.players.delete(this.guildId);
            return;
        }

        const song = queue.songs[0];
        try {
            const stream = ytdl(song.url, {
                filter: 'audioonly',
                quality: 'highestaudio',
                highWaterMark: 1 << 25
            });
            
            const resource = createAudioResource(stream);

            const player = this.players.get(this.guildId);
            player.play(resource);
            queue.playing = true;

            return song;
        } catch (error) {
            console.error(error);
            queue.songs.shift();
            return this.playSong(interaction, queue);
        }
    }

    async handleSongEnd(interaction, queue) {
        if (queue.loop) {
            // Move current song to end of queue
            const currentSong = queue.songs.shift();
            queue.songs.push(currentSong);
        } else {
            queue.songs.shift();
        }

        if (queue.songs.length > 0) {
            await this.playSong(interaction, queue);
        } else {
            queue.playing = false;
            // Auto leave after timeout if no new songs are added
            setTimeout(() => {
                if (!queue.playing && queue.songs.length === 0) {
                    queue.connection.destroy();
                    this.queues.delete(this.guildId);
                    this.players.delete(this.guildId);
                }
            }, config.bot.autoLeaveTimeout);
        }
    }

    pause() {
        const player = this.players.get(this.guildId);
        if (player) {
            player.pause();
            const queue = this.queues.get(this.guildId);
            if (queue) queue.playing = false;
        }
    }

    resume() {
        const player = this.players.get(this.guildId);
        if (player) {
            player.unpause();
            const queue = this.queues.get(this.guildId);
            if (queue) queue.playing = true;
        }
    }

    skip() {
        const player = this.players.get(this.guildId);
        if (player) {
            player.stop();
        }
    }

    stop() {
        const queue = this.queues.get(this.guildId);
        if (queue) {
            queue.songs = [];
            const player = this.players.get(this.guildId);
            if (player) player.stop();
            queue.connection.destroy();
            this.queues.delete(this.guildId);
            this.players.delete(this.guildId);
        }
    }

    setVolume(volume) {
        const queue = this.queues.get(this.guildId);
        if (queue) {
            queue.volume = Math.min(Math.max(volume, config.player.minVolume), config.player.maxVolume);
            const player = this.players.get(this.guildId);
            if (player && player.state.resource) {
                player.state.resource.volume.setVolume(queue.volume / 100);
            }
        }
    }

    toggleLoop() {
        const queue = this.queues.get(this.guildId);
        if (queue) {
            queue.loop = !queue.loop;
            return queue.loop;
        }
        return false;
    }

    toggleShuffle() {
        const queue = this.queues.get(this.guildId);
        if (queue) {
            queue.shuffle = !queue.shuffle;
            if (queue.shuffle) {
                // Fisher-Yates shuffle algorithm
                for (let i = queue.songs.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [queue.songs[i], queue.songs[j]] = [queue.songs[j], queue.songs[i]];
                }
            }
            return queue.shuffle;
        }
        return false;
    }

    getQueue() {
        return this.queues.get(this.guildId)?.songs || [];
    }

    getCurrentSong() {
        const queue = this.queues.get(this.guildId);
        return queue?.songs[0];
    }
} 