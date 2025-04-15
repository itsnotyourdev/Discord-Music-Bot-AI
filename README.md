# Discord Music Bot

A powerful Discord music bot with AI-powered autoplay features, built with Discord.js and Node.js.

## Features

- 🎵 High-quality music playback using FFmpeg
- 🎮 Interactive buttons for control (play, pause, skip, stop)
- 📋 Queue management
- 🤖 AI-powered song suggestions using Gemini 1.5 Flash
- 🎨 Modern Discord modals for user interaction
- 🎧 Seamless voice channel integration

## Prerequisites

- Node.js v16.9.0 or higher
- FFmpeg installed on your system
- A Discord bot token
- A Discord server to test the bot

## Installation

1. Clone this repository:
```bash
git clone https://github.com/yourusername/music-discord-bot.git
cd music-discord-bot
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file in the root directory and add your Discord bot token:
```
DISCORD_TOKEN=your_discord_bot_token_here
GUILD_ID=your_guild_id_here
```

4. Start the bot:
```bash
npm start
```

For development with auto-reload:
```bash
npm run dev
```

## Commands

- `/play [query]` - Play a song or add it to the queue
  - Interactive buttons for control
  - Modal for song requests
  - AI-powered suggestions when queue is empty

## Contributing

Feel free to submit issues and enhancement requests!

## License

This project is licensed under the MIT License - see the LICENSE file for details. 