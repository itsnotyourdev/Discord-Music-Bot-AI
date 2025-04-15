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
        clientId: process.env.YOUTUBE_CLIENT_ID,
        clientSecret: process.env.YOUTUBE_CLIENT_SECRET,
        redirectUri: process.env.YOUTUBE_REDIRECT_URI || 'http://localhost:3000/oauth2callback',
        apiKey: process.env.YOUTUBE_API_KEY // Fallback for simple API key
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