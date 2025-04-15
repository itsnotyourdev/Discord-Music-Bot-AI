const { G4F } = require('g4f');
const config = require('../config/config');

class AIService {
    constructor() {
        this.g4f = new G4F();
    }

    async getSongSuggestions(currentSong, count = config.ai.maxSuggestions) {
        try {
            const prompt = `Based on the song "${currentSong.title}", suggest ${count} similar songs that would be good to play next. 
            Return only the song titles, one per line, without any additional text or formatting.`;

            const response = await this.g4f.chatCompletion({
                messages: [{ role: "user", content: prompt }],
                model: config.ai.model
            });

            const suggestions = response.choices[0].message.content
                .split('\n')
                .filter(song => song.trim())
                .slice(0, count);

            return suggestions;
        } catch (error) {
            console.error('AI suggestion failed:', error);
            return [];
        }
    }

    async getPlaylistSuggestions(mood, genre, count = 5) {
        try {
            const prompt = `Create a playlist of ${count} songs that match the mood "${mood}" and genre "${genre}". 
            Return only the song titles, one per line, without any additional text or formatting.`;

            const response = await this.g4f.chatCompletion({
                messages: [{ role: "user", content: prompt }],
                model: config.ai.model
            });

            const suggestions = response.choices[0].message.content
                .split('\n')
                .filter(song => song.trim())
                .slice(0, count);

            return suggestions;
        } catch (error) {
            console.error('AI playlist suggestion failed:', error);
            return [];
        }
    }

    async analyzeMusicTaste(songs) {
        try {
            const prompt = `Analyze these songs and describe the music taste: ${songs.join(', ')}. 
            Keep the response short and focused on the main genre and mood.`;

            const response = await this.g4f.chatCompletion({
                messages: [{ role: "user", content: prompt }],
                model: config.ai.model
            });

            return response.choices[0].message.content;
        } catch (error) {
            console.error('AI analysis failed:', error);
            return 'Unable to analyze music taste at this time.';
        }
    }
}

module.exports = new AIService(); 