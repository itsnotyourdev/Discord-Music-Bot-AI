import { joinVoiceChannel, createAudioPlayer, createAudioResource } from '@discordjs/voice';
import ytdl from '@distube/ytdl-core';
import { config } from '../config/config.js';
import { G4F } from 'g4f';
import SpotifyWebApi from 'spotify-web-api-node';

class MusicService {
    constructor() {
        this.queues = new Map();
        this.players = new Map();
        this.g4f = new G4F();
        this.spotifyApi = new SpotifyWebApi({
            clientId: config.spotify.clientId,
            clientSecret: config.spotify.clientSecret,
            redirectUri: config.spotify.redirectUri
        });
        this.initializeSpotify();
    }

    async initializeSpotify() {
        try {
            const data = await this.spotifyApi.clientCredentialsGrant();
            this.spotifyApi.setAccessToken(data.body['access_token']);
            console.log('Spotify API initialized successfully');
        } catch (error) {
            console.error('Error initializing Spotify API:', error);
        }
    }

    async searchSpotify(query) {
        try {
            const searchResult = await this.spotifyApi.searchTracks(query, { limit: 1 });
            if (!searchResult.body.tracks.items.length) {
                return null;
            }

            const track = searchResult.body.tracks.items[0];
            return {
                title: track.name,
                artist: track.artists[0].name,
                url: track.external_urls.spotify,
                duration: Math.floor(track.duration_ms / 1000),
                thumbnail: track.album.images[0]?.url,
                previewUrl: track.preview_url
            };
        } catch (error) {
            console.error('Error searching Spotify:', error);
            return null;
        }
    }

    async getRecommendations(currentSong) {
        try {
            console.log('Getting recommendations for:', currentSong.title);
            
            // First, try to get Spotify recommendations
            let recommendations = [];
            
            if (currentSong.spotifyUrl) {
                try {
                    // Extract track ID from Spotify URL
                    const trackId = currentSong.spotifyUrl.split('/').pop();
                    const response = await this.spotifyApi.getRecommendations({
                        seed_tracks: [trackId],
                        limit: 5
                    });

                    if (response.body.tracks && response.body.tracks.length > 0) {
                        recommendations = response.body.tracks.map(track => ({
                            title: track.name,
                            artist: track.artists[0].name,
                            url: track.external_urls.spotify,
                            duration: Math.floor(track.duration_ms / 1000),
                            thumbnail: track.album.images[0]?.url
                        }));
                    }
                } catch (error) {
                    console.error('Error getting Spotify recommendations:', error);
                }
            }

            // If no Spotify recommendations, use AI
            if (recommendations.length === 0) {
                try {
                    const prompt = `Based on the song "${currentSong.title}"${currentSong.artist ? ` by ${currentSong.artist}` : ''}, suggest 5 similar songs that would be good to play next. 
                    Return only the song titles and artists in this format: "Song Title - Artist Name", one per line.`;

                    const response = await this.g4f.chatCompletion({
                        messages: [{ role: "user", content: prompt }],
                        model: config.ai.model
                    });

                    const aiSuggestions = response.choices[0].message.content
                        .split('\n')
                        .filter(line => line.trim())
                        .slice(0, 5);

                    // Convert AI suggestions to Spotify search queries
                    for (const suggestion of aiSuggestions) {
                        try {
                            const searchResult = await this.spotifyApi.searchTracks(suggestion, { limit: 1 });
                            if (searchResult.body.tracks.items.length > 0) {
                                const track = searchResult.body.tracks.items[0];
                                recommendations.push({
                                    title: track.name,
                                    artist: track.artists[0].name,
                                    url: track.external_urls.spotify,
                                    duration: Math.floor(track.duration_ms / 1000),
                                    thumbnail: track.album.images[0]?.url
                                });
                            }
                        } catch (error) {
                            console.error('Error searching Spotify for suggestion:', error);
                        }
                    }
                } catch (error) {
                    console.error('Error getting AI recommendations:', error);
                }
            }

            // If still no recommendations, fall back to YouTube-based search
            if (recommendations.length === 0) {
                const searchQueries = [
                    `${currentSong.title} similar songs`,
                    `${currentSong.title} related songs`,
                    `songs like ${currentSong.title}`,
                    `music similar to ${currentSong.title}`
                ];
                
                for (const query of searchQueries) {
                    const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
                    const response = await fetch(searchUrl);
                    const html = await response.text();
                    
                    const titleMatches = html.matchAll(/"title":{"runs":\[{"text":"([^"]+)"}\],"accessibility"/g);
                    const titles = Array.from(titleMatches).map(match => match[1]);
                    
                    const newRecommendations = titles
                        .filter(title => title !== currentSong.title)
                        .slice(0, 5);
                    
                    recommendations = [...recommendations, ...newRecommendations];
                    
                    if (recommendations.length >= 5) {
                        break;
                    }
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
            let song = null;

            // Try Spotify search first
            if (!ytdl.validateURL(query)) {
                const spotifyTrack = await this.searchSpotify(query);
                if (spotifyTrack) {
                    // Use the track name and artist to search YouTube
                    const youtubeQuery = `${spotifyTrack.title} ${spotifyTrack.artist} official audio`;
                    try {
                        const searchQuery = encodeURIComponent(youtubeQuery);
                        const apiUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${searchQuery}&type=video&key=${config.youtube.apiKey}&maxResults=1`;
                        
                        const response = await fetch(apiUrl);
                        const data = await response.json();
                        
                        if (data.items && data.items.length > 0) {
                            const videoId = data.items[0].id.videoId;
                            const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
                            
                            // Get video info
                            const videoInfo = await ytdl.getInfo(videoUrl);
                            song = {
                                title: spotifyTrack.title,
                                artist: spotifyTrack.artist,
                                url: videoUrl,
                                duration: spotifyTrack.duration,
                                thumbnail: spotifyTrack.thumbnail,
                                requestedBy: user.tag,
                                spotifyUrl: spotifyTrack.url
                            };
                        }
                    } catch (error) {
                        console.error('Error using YouTube API:', error);
                    }
                }
            }

            // If Spotify search failed or it's a direct YouTube URL, use YouTube
            if (!song) {
                if (!ytdl.validateURL(query)) {
                    try {
                        const searchQuery = encodeURIComponent(query);
                        const apiUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${searchQuery}&type=video&key=${config.youtube.apiKey}&maxResults=1`;
                        
                        const response = await fetch(apiUrl);
                        const data = await response.json();
                        
                        if (!data.items || data.items.length === 0) {
                            throw new Error('No results found!');
                        }
                        
                        const videoId = data.items[0].id.videoId;
                        const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
                        
                        // Get video info
                        const videoInfo = await ytdl.getInfo(videoUrl);
                        song = {
                            title: videoInfo.videoDetails.title,
                            url: videoUrl,
                            duration: videoInfo.videoDetails.lengthSeconds,
                            thumbnail: videoInfo.videoDetails.thumbnails[0].url,
                            requestedBy: user.tag
                        };
                    } catch (error) {
                        console.error('Error using YouTube API:', error);
                        throw new Error('No results found!');
                    }
                } else {
                    // Direct YouTube URL
                    const videoInfo = await ytdl.getInfo(query);
                    song = {
                        title: videoInfo.videoDetails.title,
                        url: videoInfo.videoDetails.video_url,
                        duration: videoInfo.videoDetails.lengthSeconds,
                        thumbnail: videoInfo.videoDetails.thumbnails[0].url,
                        requestedBy: user.tag
                    };
                }
            }

            console.log(`Found song: ${song.title}`);
            queue.songs.push(song);
            queue.playedSongs.add(song.title);

            // Create and send playing embed
            const playingEmbed = {
                title: queue.playing ? '🎵 Added to Queue' : '🎵 Now Playing',
                description: song.artist 
                    ? `[${song.title} - ${song.artist}](${song.spotifyUrl || song.url})`
                    : `[${song.title}](${song.url})`,
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
                    url: song.thumbnail
                }
            };

            // Send the embed
            await context.channel.send({ embeds: [playingEmbed] });

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
                    }
                });

                player.on('error', error => {
                    console.error('Player error:', error);
                });
            }

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
            // Always use YouTube URL for streaming
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