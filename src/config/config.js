export const config = {
    // Bot configuration
    bot: {
        prefix: 'd!',
        defaultVolume: 100,
        maxQueueSize: 100,
        autoLeaveTimeout: 300000, // 5 minutes
        defaultLanguage: 'en'
    },

    // Music player configuration
    player: {
        defaultVolume: 100,
        maxVolume: 150,
        minVolume: 0,
        bufferTime: 1000,
        quality: 'highest'
    },

    // YouTube API configuration
    youtube: {
        apiKey: process.env.YOUTUBE_API_KEY
    },

    // Spotify API configuration
    spotify: {
        clientId: process.env.SPOTIFY_CLIENT_ID,
        clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
        redirectUri: process.env.SPOTIFY_REDIRECT_URI || 'http://localhost:3000/callback'
    },

    // AI configuration
    ai: {
        model: 'gemini-1.5-flash',
        maxSuggestions: 3,
        suggestionTimeout: 5000
    },

    // Discord configuration
    clientId: process.env.CLIENT_ID, // Your bot's client ID
    guildId: process.env.GUILD_ID, // Optional: Specific guild ID for development

    // Emojis
    emojis: {
        play: '▶️',
        pause: '⏸️',
        skip: '⏭️',
        stop: '⏹️',
        queue: '📋',
        volume: '🔊',
        shuffle: '🔀',
        loop: '🔁',
        error: '❌',
        success: '✅'
    },

    // Colors for embeds
    colors: {
        default: '#0099ff',
        error: '#ff0000',
        success: '#00ff00',
        warning: '#ffff00'
    },
}; 