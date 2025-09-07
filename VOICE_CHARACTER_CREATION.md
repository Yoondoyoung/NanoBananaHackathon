# Voice-Based Character Creation System

## Overview
This system allows children to create their own game characters through voice interaction using AI technologies.

## Features
- **Voice Recording**: Uses browser's MediaRecorder API for audio capture
- **Speech-to-Text**: OpenAI Whisper API for Korean speech transcription
- **Text-to-Speech**: OpenAI TTS with Nova voice for natural responses
- **Character Generation**: DALL-E 3 for character image creation
- **Conversational Flow**: Multi-step dialogue to collect character information

## Setup Instructions

### 1. Backend Setup
```bash
cd backend
npm install
```

### 2. Environment Variables
Create a `.env` file in the backend directory with:
```env
PORT=4000
NODE_ENV=development
CORS_ORIGIN=http://localhost:5173

# AI APIs
OPENAI_API_KEY=your_openai_api_key_here
GEMINI_API_KEY=your_gemini_api_key_here
```

### 3. API Keys Required
- **OpenAI API Key**: For Whisper (speech-to-text) and TTS (text-to-speech)
- **Gemini API Key**: For character description processing (optional, currently using DALL-E)

### 4. Running the System
```bash
# Backend
cd backend
npm run dev

# Frontend
cd frontend
npm run dev
```

## How It Works

### 1. User Flow
1. User clicks "캐릭터 만들기" button
2. Voice creation interface opens
3. AI asks for character name (Korean voice)
4. User speaks their name
5. AI asks for hero type (magician, knight, explorer, etc.)
6. User describes their hero type
7. AI asks for appearance details
8. User describes appearance
9. System generates character image using DALL-E
10. Character is created and integrated into the game

### 2. Technical Flow
1. **Frontend**: Records audio using MediaRecorder API
2. **Backend**: Receives audio file via `/api/voice-input`
3. **Whisper**: Transcribes Korean speech to text
4. **TTS**: Generates Nova voice response
5. **DALL-E**: Creates character image from collected data
6. **Frontend**: Displays final character and integrates into game

## API Endpoints

### POST /api/voice-input
Handles voice input processing with multiple actions:

#### Audio Transcription
```javascript
// FormData with audio file
const formData = new FormData()
formData.append('audio', audioBlob, 'recording.wav')
formData.append('step', '0')
formData.append('field', 'name')

fetch('/api/voice-input', {
  method: 'POST',
  body: formData
})
```

#### Text-to-Speech
```javascript
fetch('/api/voice-input', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ 
    action: 'tts',
    text: 'Hello, what is your name?' 
  })
})
```

#### Character Generation
```javascript
fetch('/api/voice-input', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ 
    action: 'generate_character',
    characterData: {
      name: 'Alice',
      heroType: 'Magician',
      appearance: 'Blue hair, purple dress'
    }
  })
})
```

## Components

### VoiceCharacterCreation.tsx
- Main React component for voice interaction
- Handles audio recording and playback
- Manages conversation flow
- Displays character creation progress

### Backend Routes
- `src/routes/voice.ts`: Voice processing endpoint
- Handles file uploads, AI API calls, and responses

## Security Considerations
- Audio files are temporarily stored and immediately deleted
- API keys should be kept secure
- CORS is configured for development
- File size limits are enforced (10MB max)

## Browser Compatibility
- Requires modern browser with MediaRecorder API support
- Microphone permission required
- Audio playback support needed

## Future Enhancements
- Save character data to Supabase
- Character customization options
- Multiple language support
- Voice emotion detection
- Character animation integration
