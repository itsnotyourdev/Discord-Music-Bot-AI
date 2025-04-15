import { joinVoiceChannel, createAudioPlayer, createAudioResource } from '@discordjs/voice';
import ytdl from '@distube/ytdl-core';
import { config } from '../config/config.js';
import { G4F } from 'g4f';

class MusicService {
    constructor() {
        this.queues = new Map();
        this.players = new Map();
        this.g4f = new G4F();
    }

    async getRecommendations(currentSong) {
        try {
            console.log('Getting recommendations for:', currentSong.title);
            
            // Try different search queries to get varied results
            const searchQueries = [
                `${currentSong.title} similar songs`,
                `${currentSong.title} related songs`,
                `songs like ${currentSong.title}`,
                `music similar to ${currentSong.title}`
            ];
            
            let recommendations = [];
            
            // Try each search query until we get some recommendations
            for (const query of searchQueries) {
                const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
                const response = await fetch(searchUrl);
                const html = await response.text();
                
                // Extract video titles from the search results
                const titleMatches = html.matchAll(/"title":{"runs":\[{"text":"([^"]+)"}\],"accessibility"/g);
                const titles = Array.from(titleMatches).map(match => match[1]);
                
                // Filter out the current song and add to recommendations
                const newRecommendations = titles
                    .filter(title => title !== currentSong.title)
                    .slice(0, 5);
                
                recommendations = [...recommendations, ...newRecommendations];
                
                if (recommendations.length >= 5) {
                    break;
                }
            }
            
            if (recommendations.length === 0) {
                console.log('No recommendations found');
                return [];
            }
            
            console.log('Found recommendations:', recommendations);
            return recommendations;
        } catch (error) {
            console.error('Error getting recommendations:', error);
            return [];
        }
    }

    async play(context, query) {
        try {
            // Handle both message and interaction objects
            const guildId = context.guild.id;
            const member = context.member;
            const voiceChannel = member.voice.channel;
            const user = context.author || context.user;

            if (!voiceChannel) {
                throw new Error('You need to be in a voice channel to play music!');
            }

            // Check if bot has permission to join voice channel
            if (!voiceChannel.joinable) {
                throw new Error('I don\'t have permission to join your voice channel!');
            }

            // Initialize queue if it doesn't exist
            if (!this.queues.has(guildId)) {
                this.queues.set(guildId, {
                    voiceChannel,
                    connection: null,
                    songs: [],
                    playing: false,
                    volume: config.player.defaultVolume,
                    loop: false,
                    shuffle: false,
                    playedSongs: new Set() // Track played songs to avoid duplicates
                });
            }

            const queue = this.queues.get(guildId);

            // Search for the song
            console.log(`Searching for: ${query}`);
            let videoUrl = query;
            
            // If the query is not a URL, search YouTube
            if (!ytdl.validateURL(query)) {
                // Create a search URL
                const searchQuery = encodeURIComponent(query);
                videoUrl = `https://www.youtube.com/results?search_query=${searchQuery}`;
                
                // Get the first video from search results
                const response = await fetch(videoUrl);
                const html = await response.text();
                
                // Extract the first video ID from the search results
                const videoIdMatch = html.match(/"videoId":"([^"]+)"/);
                if (!videoIdMatch) {
                    throw new Error('No results found!');
                }
                
                videoUrl = `https://www.youtube.com/watch?v=${videoIdMatch[1]}`;
            }

            // Get video info
            const videoInfo = await ytdl.getInfo(videoUrl);
            const song = {
                title: videoInfo.videoDetails.title,
                url: videoInfo.videoDetails.video_url,
                duration: videoInfo.videoDetails.lengthSeconds,
                requestedBy: user.tag
            };

            console.log(`Found song: ${song.title}`);
            queue.songs.push(song);
            queue.playedSongs.add(song.title);

            // Create and send playing embed
            const playingEmbed = {
                title: queue.playing ? '🎵 Added to Queue' : '🎵 Now Playing',
                description: `[${song.title}](${song.url})`,
                fields: [
                    {
                        name: 'Duration',
                        value: this.formatDuration(song.duration),
                        inline: true
                    },
                    {
                        name: 'Requested by',
                        value: song.requestedBy,
                        inline: true
                    },
                    {
                        name: 'Position in queue',
                        value: queue.playing ? `${queue.songs.length - 1} songs ahead` : 'Now playing',
                        inline: true
                    }
                ],
                color: 0x00ff00,
                thumbnail: {
                    url: videoInfo.videoDetails.thumbnails[0].url
                }
            };

            // Send the embed
            await context.channel.send({ embeds: [playingEmbed] });

            // Join voice channel if not already connected
            if (!queue.connection) {
                console.log('Joining voice channel...');
                const connection = joinVoiceChannel({
                    channelId: voiceChannel.id,
                    guildId: context.guild.id,
                    adapterCreator: context.guild.voiceAdapterCreator,
                });

                queue.connection = connection;
                const player = createAudioPlayer();
                this.players.set(guildId, player);
                connection.subscribe(player);

                player.on('stateChange', (oldState, newState) => {
                    console.log(`Player state changed: ${oldState.status} -> ${newState.status}`);
                    if (newState.status === 'idle') {
                        this.handleSongEnd(context, queue);
                    } else if (newState.status === 'autopaused') {
                        // Check if there are listeners in the voice channel
                        const listeners = voiceChannel.members.filter(member => !member.user.bot).size;
                        if (listeners > 0) {
                            console.log('Resuming playback as there are listeners in the channel');
                            player.unpause();
                        }
                    }
                });

                player.on('error', error => {
                    console.error('Player error:', error);
                });
            }

            // Play the song if not already playing
            if (!queue.playing) {
                console.log('Starting playback...');
                await this.playSong(context, queue);
            }

            return song;
        } catch (error) {
            console.error('Error in play method:', error);
            throw error;
        }
    }

    formatDuration(seconds) {
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    }

    async playSong(context, queue) {
        if (queue.songs.length === 0) {
            if (queue.connection) {
                try {
                    // Check if the connection is still valid before destroying
                    if (queue.connection.state.status !== 'destroyed') {
                        queue.connection.destroy();
                    }
                } catch (error) {
                    console.error('Error destroying connection:', error);
                }
            }
            if (context?.guild?.id) {
                this.queues.delete(context.guild.id);
                this.players.delete(context.guild.id);
            }
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
            const player = this.players.get(context?.guild?.id);
            if (player) {
                player.play(resource);
                queue.playing = true;
            }

            return song;
        } catch (error) {
            console.error('Error playing song:', error);
            queue.songs.shift();
            return this.playSong(context, queue);
        }
    }

    async handleSongEnd(context, queue) {
        // Remove the current song from the queue
        const lastPlayedSong = queue.songs.shift();

        if (queue.songs.length > 0) {
            // Play the next song in queue
            const nextSong = queue.songs[0];
            console.log('Playing next song in queue:', nextSong.title);
            
            try {
                const stream = ytdl(nextSong.url, {
                    filter: 'audioonly',
                    quality: 'highestaudio',
                    highWaterMark: 1 << 25
                });

                const resource = createAudioResource(stream);
                const player = this.players.get(context?.guild?.id);
                if (player) {
                    player.play(resource);
                    queue.playing = true;
                }
            } catch (error) {
                console.error('Error playing next song:', error);
                // If there's an error, try the next song
                queue.songs.shift();
                if (queue.songs.length > 0) {
                    this.handleSongEnd(context, queue);
                } else {
                    queue.playing = false;
                }
            }
        } else {
            queue.playing = false;
            // Auto leave after timeout if no new songs are added
            setTimeout(() => {
                if (!queue.playing && queue.songs.length === 0) {
                    try {
                        if (queue.connection?.state?.status !== 'destroyed') {
                            queue.connection.destroy();
                        }
                    } catch (error) {
                        console.error('Error destroying connection:', error);
                    }
                    this.queues.delete(context.guild.id);
                    this.players.delete(context.guild.id);
                }
            }, config.bot.autoLeaveTimeout);
        }
    }

    pause(guildId) {
        const player = this.players.get(guildId);
        if (player) {
            player.pause();
            const queue = this.queues.get(guildId);
            if (queue) queue.playing = false;
        }
    }

    resume(guildId) {
        const player = this.players.get(guildId);
        if (player) {
            player.unpause();
            const queue = this.queues.get(guildId);
            if (queue) queue.playing = true;
        }
    }

    async skip(guildId, context) {
        const player = this.players.get(guildId);
        if (!player) return;

        const queue = this.queues.get(guildId);
        if (!queue) return;

        try {
            // Stop the current song and wait for it to fully stop
            player.stop();
            
            // Remove the current song from the queue
            const lastPlayedSong = queue.songs.shift();
            
            // If there are more songs in the queue, play the next one
            if (queue.songs.length > 0) {
                const nextSong = queue.songs[0];
                console.log('Playing next song in queue:', nextSong.title);
                
                try {
                    // Create a new stream for the next song
                    const stream = ytdl(nextSong.url, {
                        filter: 'audioonly',
                        quality: 'highestaudio',
                        highWaterMark: 1 << 25
                    });

                    // Create a new resource
                    const resource = createAudioResource(stream);
                    
                    // Wait a short moment to ensure the player is ready
                    await new Promise(resolve => setTimeout(resolve, 100));
                    
                    // Play the new resource
                    player.play(resource);
                    queue.playing = true;

                    // Send skip and now playing embeds
                    const skipEmbed = {
                        title: '⏭️ Skipped',
                        description: `Skipped: ${lastPlayedSong.title}`,
                        color: 0x00ff00
                    };

                    const nextSongEmbed = {
                        title: '🎵 Now Playing',
                        description: `[${nextSong.title}](${nextSong.url})`,
                        fields: [
                            {
                                name: 'Duration',
                                value: this.formatDuration(nextSong.duration),
                                inline: true
                            },
                            {
                                name: 'Requested by',
                                value: nextSong.requestedBy,
                                inline: true
                            }
                        ],
                        color: 0x00ff00,
                        thumbnail: {
                            url: `https://img.youtube.com/vi/${nextSong.url.split('v=')[1]}/hqdefault.jpg`
                        }
                    };

                    await context.channel.send({ embeds: [skipEmbed, nextSongEmbed] });
                } catch (error) {
                    console.error('Error playing next song:', error);
                    // If there's an error, try the next song
                    queue.songs.shift();
                    if (queue.songs.length > 0) {
                        await this.skip(guildId, context);
                    } else {
                        queue.playing = false;
                        // Auto leave after timeout if no new songs are added
                        setTimeout(() => {
                            if (!queue.playing && queue.songs.length === 0) {
                                try {
                                    if (queue.connection?.state?.status !== 'destroyed') {
                                        queue.connection.destroy();
                                    }
                                } catch (error) {
                                    console.error('Error destroying connection:', error);
                                }
                                this.queues.delete(guildId);
                                this.players.delete(guildId);
                            }
                        }, config.bot.autoLeaveTimeout);
                    }
                }
            } else {
                queue.playing = false;
                // Auto leave after timeout if no new songs are added
                setTimeout(() => {
                    if (!queue.playing && queue.songs.length === 0) {
                        try {
                            if (queue.connection?.state?.status !== 'destroyed') {
                                queue.connection.destroy();
                            }
                        } catch (error) {
                            console.error('Error destroying connection:', error);
                        }
                        this.queues.delete(guildId);
                        this.players.delete(guildId);
                    }
                }, config.bot.autoLeaveTimeout);
            }
        } catch (error) {
            console.error('Error in skip method:', error);
            // If there's an error, try to recover by stopping the player
            try {
                player.stop();
            } catch (e) {
                console.error('Error stopping player:', e);
            }
        }
    }

    async handleEmptyQueue(guildId, queue) {
        queue.playing = false;
        await this.destroyConnection(queue);
        this.initAutoLeaveTimeout(guildId, queue);
    }

    async destroyConnection(queue) {
        try {
            if (queue.connection?.state?.status !== 'destroyed') {
                queue.connection.destroy();
            }
        } catch (error) {
            console.error('Error destroying voice connection:', error);
        }
    }

    initAutoLeaveTimeout(guildId, queue) {
        setTimeout(() => {
            if (!queue.playing && queue.songs.length === 0) {
                this.queues.delete(guildId);
                this.players.delete(guildId);
            }
        }, config.bot.autoLeaveTimeout);
    }

    async playNextSong(context, queue, lastPlayedSong) {
        try {
            const nextSong = queue.songs[0];
            const videoInfo = await ytdl.getInfo(nextSong.url);
            
            if (context?.channel) {
                await this.sendSkipEmbeds(context, lastPlayedSong, nextSong, videoInfo);
            }
            
            // Create and play the next song
            const stream = ytdl(nextSong.url, {
                filter: 'audioonly',
                quality: 'highestaudio',
                highWaterMark: 1 << 25
            });

            const resource = createAudioResource(stream);
            const player = this.players.get(context?.guild?.id);
            if (player) {
                player.play(resource);
                queue.playing = true;
            }
        } catch (error) {
            console.error('Error playing next song:', error);
            // If there's an error, try the next song
            queue.songs.shift();
            if (queue.songs.length > 0) {
                await this.playNextSong(context, queue, lastPlayedSong);
            } else {
                await this.handleEmptyQueue(context?.guild?.id, queue);
            }
        }
    }

    async sendSkipEmbeds(context, lastPlayedSong, nextSong, videoInfo) {
        try {
            const skipEmbed = {
                title: '⏭️ Skipped',
                description: `Skipped: ${lastPlayedSong.title}`,
                color: 0x00ff00
            };

            const nextSongEmbed = {
                title: '🎵 Now Playing',
                description: `[${nextSong.title}](${nextSong.url})`,
                fields: [
                    {
                        name: 'Duration',
                        value: this.formatDuration(nextSong.duration),
                        inline: true
                    },
                    {
                        name: 'Requested by',
                        value: nextSong.requestedBy,
                        inline: true
                    }
                ],
                color: 0x00ff00,
                thumbnail: {
                    url: videoInfo.videoDetails.thumbnails[0]?.url ?? 'https://i.ytimg.com/vi/_/hqdefault.jpg'
                }
            };

            await context.channel.send({ embeds: [skipEmbed, nextSongEmbed] });
        } catch (error) {
            console.error('Error sending skip embeds:', error);
        }
    }

    stop(guildId) {
        const queue = this.queues.get(guildId);
        if (queue) {
            queue.songs = [];
            const player = this.players.get(guildId);
            if (player) player.stop();
            queue.connection.destroy();
            this.queues.delete(guildId);
            this.players.delete(guildId);
        }
    }

    setVolume(guildId, volume) {
        const queue = this.queues.get(guildId);
        if (queue) {
            queue.volume = Math.min(Math.max(volume, config.player.minVolume), config.player.maxVolume);
            const player = this.players.get(guildId);
            if (player) {
                player.state.resource.volume.setVolume(queue.volume / 100);
            }
        }
    }

    toggleLoop(guildId) {
        const queue = this.queues.get(guildId);
        if (queue) {
            queue.loop = !queue.loop;
            return queue.loop;
        }
        return false;
    }

    toggleShuffle(guildId) {
        const queue = this.queues.get(guildId);
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

    getQueue(guildId) {
        return this.queues.get(guildId)?.songs || [];
    }

    getCurrentSong(guildId) {
        const queue = this.queues.get(guildId);
        return queue?.songs[0];
    }
}

const musicService = new MusicService();
export { musicService }; 