import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import speech from '@google-cloud/speech';
import { createClient } from '@supabase/supabase-js';
import voiceRoutes from './routes/voice';
import realtimeRoutes from './routes/realtime';
import { RealtimeServer } from './realtime-server';
import { AgentsServer } from './agents-server';
import { startWebSocketProxy } from './websocket-proxy';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

// Initialize Google Cloud Speech-to-Text client
const speechClient = new speech.SpeechClient({
  keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS,
  projectId: process.env.GOOGLE_CLOUD_PROJECT_ID
});

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_ANON_KEY || ''
);

// Middleware
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173'
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serve static audio files
app.use('/api/audio', express.static(path.join(__dirname, '..', 'temp')))

// Routes
app.get('/health', (req, res) => {
  res.json({ 
    status: 'success', 
    message: 'NanoBanana Backend is running!',
    timestamp: new Date().toISOString()
  });
});

// Cache for client secrets to prevent duplicate generation
const clientSecretCache = new Map<string, { secret: string; expires: number }>();
let isGeneratingSecret = false;

// Generate client secret for Agents SDK
app.post('/api/generate-client-secret', async (req, res) => {
  try {
    console.log('🔑 Generating client secret...');
    console.log('API Key exists:', !!process.env.OPENAI_API_KEY);
    
    // Check if already generating
    if (isGeneratingSecret) {
      console.log('⏳ Client secret generation already in progress, waiting...');
      // Wait for current generation to complete
      while (isGeneratingSecret) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      // Check cache after waiting
      const cacheKey = 'default';
      const cached = clientSecretCache.get(cacheKey);
      if (cached && cached.expires > Date.now()) {
        console.log('✅ Using cached client secret after wait');
        return res.json({ 
          status: 'success', 
          clientSecret: cached.secret 
        });
      }
    }
    
    // Check cache first
    const cacheKey = 'default';
    const cached = clientSecretCache.get(cacheKey);
    if (cached && cached.expires > Date.now()) {
      console.log('✅ Using cached client secret');
      return res.json({ 
        status: 'success', 
        clientSecret: cached.secret 
      });
    }
    
    // Set flag to prevent concurrent requests
    isGeneratingSecret = true;
    
    const response = await fetch('https://api.openai.com/v1/realtime/client_secrets', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        session: {
          type: 'realtime',
          model: 'gpt-realtime'
        }
      })
    });

    console.log('OpenAI API response status:', response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenAI API error response:', errorText);
      throw new Error(`OpenAI API error: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const data = await response.json();
    console.log('✅ Client secret generated successfully');
    console.log('Response data structure:', JSON.stringify(data, null, 2));
    
    // OpenAI API returns client secret in data.value
    const clientSecret = data.value;
    
    if (!clientSecret) {
      throw new Error('Client secret not found in response');
    }
    
    // Cache the client secret (expires in 1 hour)
    clientSecretCache.set(cacheKey, {
      secret: clientSecret,
      expires: Date.now() + 60 * 60 * 1000 // 1 hour
    });
    
    // Reset flag
    isGeneratingSecret = false;
    
    res.json({ 
      status: 'success', 
      clientSecret: clientSecret 
    });
  } catch (error) {
    console.error('❌ Error generating client secret:', error);
    // Reset flag on error
    isGeneratingSecret = false;
    res.status(500).json({ 
      status: 'error', 
      error: `Failed to generate client secret: ${(error as Error).message}` 
    });
  }
});

// Create character from conversation data
// Voice chat endpoints
app.post('/api/voice/transcribe', async (req, res) => {
  try {
    const { audioData } = req.body;
    
    if (!audioData) {
      return res.status(400).json({ error: 'Audio data is required' });
    }

    // Convert base64 to buffer
    const audioBuffer = Buffer.from(audioData, 'base64');
    
    // Create form data for Whisper API
    const formData = new FormData();
    const blob = new Blob([audioBuffer], { type: 'audio/wav' });
    formData.append('file', blob, 'audio.wav');
    formData.append('model', 'whisper-1');
    formData.append('language', 'en');

    // Call Whisper API
    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: formData
    });

    if (!response.ok) {
      throw new Error(`Whisper API failed: ${response.status}`);
    }

    const result = await response.json();
    res.json({ text: result.text });
    
  } catch (error: any) {
    console.error('❌ Error transcribing audio:', error);
    res.status(500).json({ error: `Transcription failed: ${error.message}` });
  }
});

app.post('/api/voice/chat', async (req, res) => {
  try {
    const { messages } = req.body;
    
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Messages array is required' });
    }

    // Call Chat Completions API
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: `You are NanoBanana, a friendly character creation assistant for children. Help them create their unique character by asking about their preferences, interests, and personality. Be warm and encouraging. Ask questions like:
            - What's your name?
            - How old are you?
            - What's your favorite color?
            - What do you like to do for fun?
            - What's your dream job?
            - What makes you special?
            
            After gathering enough information (about 8-10 exchanges), let them know you'll create their character!`
          },
          ...messages
        ],
        max_tokens: 150,
        temperature: 0.8
      })
    });

    if (!response.ok) {
      throw new Error(`Chat API failed: ${response.status}`);
    }

    const result = await response.json();
    const aiText = result.choices[0].message.content;
    
    res.json({ text: aiText });
    
  } catch (error: any) {
    console.error('❌ Error generating chat response:', error);
    res.status(500).json({ error: `Chat generation failed: ${error.message}` });
  }
});

app.post('/api/voice/tts', async (req, res) => {
  try {
    const { text } = req.body;
    
    if (!text) {
      return res.status(400).json({ error: 'Text is required' });
    }

    // Call TTS API
    const response = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'tts-1',
        input: text,
        voice: 'alloy',
        response_format: 'mp3'
      })
    });

    if (!response.ok) {
      throw new Error(`TTS API failed: ${response.status}`);
    }

    const audioBuffer = await response.arrayBuffer();
    const base64Audio = Buffer.from(audioBuffer).toString('base64');
    
    res.json({ audioData: base64Audio });
    
  } catch (error: any) {
    console.error('❌ Error generating TTS:', error);
    res.status(500).json({ error: `TTS generation failed: ${error.message}` });
  }
});

// Audio transcription endpoint using multer for file handling
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 } // 25MB limit
});

app.post('/api/transcribe-audio', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No audio file provided' });
    }

    console.log('🎤 Sending audio to Google Cloud Speech-to-Text...');
    
    // Configure the request for Google Cloud Speech-to-Text
    const audioBytes = req.file.buffer.toString('base64');
    
    const request = {
      audio: {
        content: audioBytes,
      },
      config: {
        encoding: 'WEBM_OPUS' as const,
        sampleRateHertz: 48000,
        languageCode: 'en-US',
        alternativeLanguageCodes: ['ko-KR'], // Support Korean as well
        enableAutomaticPunctuation: true,
        model: 'latest_long', // Use the latest model for better accuracy
      },
    };

    // Perform the speech recognition
    const [response] = await speechClient.recognize(request);
    const transcription = response.results
      ?.map(result => result.alternatives?.[0]?.transcript)
      .join(' ')
      .trim();

    if (!transcription) {
      throw new Error('No speech detected in audio');
    }

    console.log('✅ Transcription successful:', transcription);
    res.json({ text: transcription });
    
  } catch (error: any) {
    console.error('❌ Error transcribing audio:', error);
    res.status(500).json({ error: `Transcription failed: ${error.message}` });
  }
});

// Manual character information extraction as fallback
function extractCharacterInfoManually(messages: any[]): any {
  const result = {
    name: '',
    gender: '',
    age: '',
    favoriteColor: '',
    dreamJob: ''
  };

  // Get all user messages
  const userMessages = messages.filter(msg => msg.role === 'user');
  
  for (const message of userMessages) {
    const content = message.content.toLowerCase();
    
    // Extract name patterns
    if (!result.name) {
      const namePatterns = [
        /(?:my name is|i am|i'm|call me)\s+([a-zA-Z]+)/i,
        /(?:name is|name's)\s+([a-zA-Z]+)/i,
        /^([a-zA-Z]+)$/ // Single word that could be a name
      ];
      
      for (const pattern of namePatterns) {
        const match = content.match(pattern);
        if (match && match[1] && match[1].length > 1) {
          result.name = match[1];
          break;
        }
      }
    }
    
    // Extract gender
    if (!result.gender) {
      if (content.includes('boy') || content.includes('male')) {
        result.gender = 'boy';
      } else if (content.includes('girl') || content.includes('female')) {
        result.gender = 'girl';
      }
    }
    
    // Extract age
    if (!result.age) {
      const ageMatch = content.match(/(\d+)\s*(?:years? old|살|age)/i);
      if (ageMatch) {
        result.age = ageMatch[1];
      } else {
        const numberMatch = content.match(/\b(\d+)\b/);
        if (numberMatch && parseInt(numberMatch[1]) >= 3 && parseInt(numberMatch[1]) <= 18) {
          result.age = numberMatch[1];
        }
      }
    }
    
    // Extract favorite color
    if (!result.favoriteColor) {
      const colors = ['red', 'blue', 'green', 'yellow', 'purple', 'pink', 'orange', 'black', 'white', 'brown', 'gray', 'grey'];
      for (const color of colors) {
        if (content.includes(color)) {
          result.favoriteColor = color;
          break;
        }
      }
    }
    
    // Extract dream job
    if (!result.dreamJob) {
      const jobs = ['doctor', 'teacher', 'programmer', 'engineer', 'artist', 'scientist', 'police', 'firefighter', 'nurse', 'lawyer', 'pilot', 'chef', 'musician', 'athlete'];
      for (const job of jobs) {
        if (content.includes(job)) {
          result.dreamJob = job;
          break;
        }
      }
    }
  }
  
  return result;
}

// Character information extraction using Gemini AI
async function extractCharacterInfoWithGemini(messages: any[]): Promise<any> {
  try {
    // Get the latest user message for analysis
    const userMessages = messages.filter(msg => msg.role === 'user');
    if (userMessages.length === 0) {
      return {
        name: '',
        gender: '',
        age: '',
        favoriteColor: '',
        dreamJob: ''
      };
    }

    const latestMessage = userMessages[userMessages.length - 1].content;
    const conversationHistory = messages.map(msg => 
      `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`
    ).join('\n');

    console.log('🔍 Analyzing conversation with Gemini for character info...');
    console.log('📝 Conversation history:', conversationHistory);
    console.log('📝 Latest message:', latestMessage);

    const geminiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: `You are a character information extraction assistant. Analyze the conversation and extract meaningful information about the child in JSON format.

CONVERSATION HISTORY:
${conversationHistory}

LATEST MESSAGE TO ANALYZE:
${latestMessage}

Extract and return ONLY a JSON object with the following structure. If information is not mentioned, use empty string:

{
  "name": "extracted name or empty string",
  "gender": "extracted gender (boy/girl/male/female) or empty string",
  "age": "extracted age or empty string",
  "favoriteColor": "extracted favorite color or empty string",
  "dreamJob": "dream job or career mentioned or empty string"
}

IMPORTANT:
- Only extract information that is explicitly mentioned
- For name: look for "my name is", "I am", "I'm" followed by a name
- For gender: look for "boy", "girl", "male", "female"
- For age: look for numbers followed by "years old" or just numbers
- For favorite color: look for color names like "blue", "red", "green", etc.
- For dream job: look for "want to be", "programmer", "doctor", "teacher", etc.
- Return ONLY the JSON object, no other text
- ALL responses must be in English only`
          }]
        }],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 500
        }
      })
    });

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text();
      console.error('❌ Gemini extraction failed:', geminiResponse.status, errorText);
      console.error('❌ Request URL:', `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY ? 'SET' : 'NOT_SET'}`);
      return {
        name: '',
        gender: '',
        age: '',
        favoriteColor: '',
        dreamJob: ''
      };
    }

    const geminiData = await geminiResponse.json();
    const extractedText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    
    console.log('📊 Raw Gemini extraction:', extractedText);
    
    // Clean the extracted text by removing markdown code blocks
    let cleanedText = extractedText.trim();
    
    // Remove markdown code blocks (```json and ```)
    if (cleanedText.startsWith('```json')) {
      cleanedText = cleanedText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (cleanedText.startsWith('```')) {
      cleanedText = cleanedText.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }
    
    console.log('📊 Cleaned Gemini extraction:', cleanedText);
    
    // Parse the JSON response
    try {
      const extractedInfo = JSON.parse(cleanedText);
      console.log('✅ Parsed character info:', extractedInfo);
      return extractedInfo;
    } catch (parseError) {
      console.error('❌ Failed to parse Gemini JSON:', parseError);
      console.error('❌ Raw text that failed to parse:', cleanedText);
      return {
        name: '',
        gender: '',
        age: '',
        favoriteColor: '',
        dreamJob: ''
      };
    }

  } catch (error: any) {
    console.error('❌ Error in Gemini character extraction:', error);
    return {
      name: '',
      age: '',
      favoriteColor: '',
      hobbies: [],
      personality: [],
      interests: [],
      dreamJob: '',
      specialTraits: [],
      recentEvents: [],
      emotions: [],
      relationships: []
    };
  }
}

// Generate character modeling sheet using Gemini 2.5 Flash Preview
async function generateCharacterImage(characterInfo: any): Promise<{ imageUrl: string }> {
  try {
    console.log('🎨 Generating character modeling sheet with Gemini 2.5 Flash Preview...');

    const modelingSheetPrompt = `Create a character modeling sheet for a cute, child-friendly character avatar based on these details:
- Name: ${characterInfo.name || 'Unknown'}
- Gender: ${characterInfo.gender || 'Unknown'}
- Age: ${characterInfo.age || 'Unknown'} years old
- Favorite Color: ${characterInfo.favoriteColor || 'Unknown'}
- Dream Job: ${characterInfo.dreamJob || 'Unknown'}

Create a single image that shows the character from multiple angles in a modeling sheet format:
1. Front view (center, main pose)
2. Side profile view (left side)
3. Back view (right side)
4. Three-quarter view (bottom left)

Style: Cute, colorful, friendly, suitable for children. The character should be happy and inspiring. Use the favorite color as the main theme color. Make it look like a friendly companion that a child would love to have as their avatar. Cartoon style, bright colors, welcoming expression.

Layout: Arrange all four views in a clean, organized modeling sheet format with clear separation between each view. Each view should show the same character with consistent design, colors, and style.`;

    const { GoogleGenAI } = require('@google/genai');
    const ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY
    });

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-image-preview",
      contents: modelingSheetPrompt,
    });

    let imageUrl = '';
    
    if (response.candidates && response.candidates[0] && response.candidates[0].content && response.candidates[0].content.parts) {
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData) {
          const base64Data = part.inlineData.data;
          const buffer = Buffer.from(base64Data, "base64");
          
          // Upload to Supabase Storage
          const filename = `character-${characterInfo.name || 'unknown'}-modeling-sheet-${Date.now()}.png`;
          const filePath = `character-images/${filename}`;
          
          console.log('📤 Uploading character image to Supabase Storage...');
          console.log('📊 Upload details:', { filePath, bufferSize: buffer.length });
          
          const { data: uploadData, error: uploadError } = await supabase.storage
            .from('character-images')
            .upload(filePath, buffer, {
              contentType: 'image/png',
              cacheControl: '3600',
              upsert: false
            });

          if (uploadError) {
            console.error('❌ Error uploading to Supabase Storage:', uploadError);
            console.error('❌ Upload error details:', JSON.stringify(uploadError, null, 2));
            throw uploadError;
          }
          
          console.log('✅ Upload successful:', uploadData);

          // Get public URL
          const { data: urlData } = supabase.storage
            .from('character-images')
            .getPublicUrl(filePath);

          imageUrl = urlData.publicUrl;
          console.log('✅ Character image uploaded to Supabase Storage:', imageUrl);
          console.log('📊 Image data size:', buffer.length, 'bytes');
          break;
        }
      }
    }

    return { imageUrl };
    
  } catch (error: any) {
    console.error('❌ Error generating character modeling sheet:', error);
    return { imageUrl: '' };
  }
}

// Generate character description from character info
async function generateCharacterDescription(characterInfo: any): Promise<string> {
  try {
    console.log('🎨 Generating character description with Gemini...');

    const geminiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${process.env.GEMINI_API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: `You are a creative character designer. Based on the following character information, create a detailed and engaging character description for a children's story.

CHARACTER INFORMATION:
- Name: ${characterInfo.name || 'Not provided'}
- Gender: ${characterInfo.gender || 'Not provided'}
- Age: ${characterInfo.age || 'Not provided'}
- Favorite Color: ${characterInfo.favoriteColor || 'Not provided'}
- Dream Job: ${characterInfo.dreamJob || 'Not provided'}

Create a vivid, child-friendly character description (2-3 sentences) that brings this character to life. Make it engaging and suitable for a children's story.`
          }]
        }],
        generationConfig: {
          temperature: 0.8,
          maxOutputTokens: 200
        }
      })
    });

    if (!geminiResponse.ok) {
      console.error('Gemini character description failed:', geminiResponse.status);
      return `Meet ${characterInfo.name || 'our friend'}, a ${characterInfo.age || 'young'} ${characterInfo.gender || 'person'} who loves ${characterInfo.favoriteColor || 'colors'} and dreams of becoming ${characterInfo.dreamJob || 'something amazing'}!`;
    }

    const geminiData = await geminiResponse.json();
    const description = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || 
      `A wonderful character named ${characterInfo.name || 'our friend'} who loves ${characterInfo.hobbies.join(', ') || 'many things'} and dreams of becoming ${characterInfo.dreamJob || 'something amazing'}!`;
    
    console.log('✅ Character description generated:', description);
    return description;

  } catch (error: any) {
    console.error('❌ Error generating character description:', error);
    return `A wonderful character named ${characterInfo.name || 'our friend'} who loves ${characterInfo.hobbies.join(', ') || 'many things'} and dreams of becoming ${characterInfo.dreamJob || 'something amazing'}!`;
  }
}

// ElevenLabs API endpoints (using standard TTS for now)
app.get('/api/elevenlabs/voices', async (req, res) => {
  try {
    console.log('🎤 Fetching available voices from ElevenLabs...');
    
    const response = await fetch('https://api.elevenlabs.io/v1/voices', {
      method: 'GET',
      headers: {
        'xi-api-key': process.env.ELEVEN_LABS_KEY || '',
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`ElevenLabs API failed: ${response.status}`);
    }

    const data = await response.json();
    console.log('✅ Available voices:', data.voices?.length || 0);
    
    res.json(data);
  } catch (error: any) {
    console.error('❌ Error fetching voices:', error);
    res.status(500).json({ error: `Failed to fetch voices: ${error.message}` });
  }
});

// TTS 엔드포인트 추가
app.post('/api/elevenlabs/tts', async (req, res) => {
  try {
    const { text } = req.body;
    
    if (!text) {
      return res.status(400).json({ error: 'Text is required' });
    }

    console.log('🎤 Generating TTS for text:', text.substring(0, 50) + '...');
    
    // ElevenLabs TTS API 호출
    const response = await fetch('https://api.elevenlabs.io/v1/text-to-speech/21m00Tcm4TlvDq8ikWAM', {
      method: 'POST',
      headers: {
        'xi-api-key': process.env.ELEVEN_LABS_KEY || '',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        text: text,
        model_id: 'eleven_flash_v2_5',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.5
        }
      })
    });

    if (!response.ok) {
      throw new Error(`ElevenLabs TTS API failed: ${response.status}`);
    }

    const audioBuffer = await response.arrayBuffer();
    const base64Audio = Buffer.from(audioBuffer).toString('base64');
    
    console.log('✅ TTS generated successfully, size:', audioBuffer.byteLength);
    
    res.json({ 
      success: true, 
      audio: base64Audio,
      format: 'mp3'
    });
  } catch (error: any) {
    console.error('❌ Error generating TTS:', error);
    res.status(500).json({ error: `Failed to generate TTS: ${error.message}` });
  }
});

app.post('/api/elevenlabs/start-session', async (req, res) => {
  try {
    const { voice_id = 'EXAVITQu4vr4xnSDxMaL' } = req.body; // Default voice ID (Rachel)
    
    // Generate a unique session ID with more randomness
    const timestamp = Date.now();
    const random1 = Math.random().toString(36).substr(2, 9);
    const random2 = Math.random().toString(36).substr(2, 9);
    const session_id = `session_${timestamp}_${random1}_${random2}`;
    
    console.log('🆔 Generated new session ID:', session_id);
    
    res.json({ 
      session_id: session_id,
      voice_id: voice_id,
      model_id: 'eleven_flash_v2_5',
      expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString() // 30 minutes
    });
    
  } catch (error: any) {
    console.error('❌ Error starting ElevenLabs session:', error);
    res.status(500).json({ error: `Failed to start session: ${error.message}` });
  }
});

app.post('/api/elevenlabs/chat', async (req, res) => {
  try {
    const { session_id, messages, voice_id = 'EXAVITQu4vr4xnSDxMaL' } = req.body;
    
    if (!session_id || !messages) {
      return res.status(400).json({ error: 'Session ID and messages are required' });
    }

    // Load existing character info from database
    let existingCharacterInfo = null;
    try {
      const { data: existingData, error: fetchError } = await supabase
        .from('character_profiles')
        .select('*')
        .eq('session_id', session_id)
        .single();

      if (!fetchError && existingData) {
        existingCharacterInfo = {
          name: existingData.name || '',
          gender: existingData.gender || '',
          age: existingData.age || '',
          favoriteColor: existingData.favorite_color || '',
          dreamJob: existingData.dream_job || ''
        };
        console.log('📂 Loaded existing character info:', existingCharacterInfo);
      }
    } catch (loadError) {
      console.error('❌ Error loading existing character info:', loadError);
    }

    // Extract character information from conversation using Gemini AI
    const newCharacterInfo = await extractCharacterInfoWithGemini(messages);
    console.log('📊 New extracted character info:', newCharacterInfo);
    
    // If Gemini extraction failed, try manual extraction as fallback
    if (!newCharacterInfo.name && !newCharacterInfo.gender && !newCharacterInfo.age && !newCharacterInfo.favoriteColor && !newCharacterInfo.dreamJob) {
      console.log('🔄 Gemini extraction failed, trying manual extraction...');
      const manualExtraction = extractCharacterInfoManually(messages);
      console.log('📊 Manual extraction result:', manualExtraction);
      
      // Use manual extraction if it found something
      if (manualExtraction.name || manualExtraction.gender || manualExtraction.age || manualExtraction.favoriteColor || manualExtraction.dreamJob) {
        Object.assign(newCharacterInfo, manualExtraction);
        console.log('✅ Using manual extraction result:', newCharacterInfo);
      }
    }

    // Merge existing and new character info
    const characterInfo = {
      name: newCharacterInfo.name || existingCharacterInfo?.name || '',
      gender: newCharacterInfo.gender || existingCharacterInfo?.gender || '',
      age: newCharacterInfo.age || existingCharacterInfo?.age || '',
      favoriteColor: newCharacterInfo.favoriteColor || existingCharacterInfo?.favoriteColor || '',
      dreamJob: newCharacterInfo.dreamJob || existingCharacterInfo?.dreamJob || ''
    };
    
    console.log('🔄 Merged character info:', characterInfo);

    // Save character information to database if we have meaningful data
    if (characterInfo.name || characterInfo.age || characterInfo.gender || characterInfo.favoriteColor || characterInfo.dreamJob) {
      try {
        const { data, error } = await supabase
          .from('character_profiles')
          .upsert({
            session_id: session_id,
            name: characterInfo.name || null,
            gender: characterInfo.gender || null,
            age: characterInfo.age || null,
            favorite_color: characterInfo.favoriteColor || null,
            dream_job: characterInfo.dreamJob || null,
            updated_at: new Date().toISOString()
          }, {
            onConflict: 'session_id'
          });

        if (error) {
          console.error('❌ Error saving character info:', error);
        } else {
          console.log('✅ Character info saved to database');
        }
      } catch (dbError) {
        console.error('❌ Database error:', dbError);
      }
    }

    // Generate AI response using Gemini API
    console.log('🤖 Generating AI response with Gemini...');
    console.log('📝 Messages received:', messages.length);
    console.log('📝 Last few messages:', messages.slice(-3).map((m: any) => `${m.role}: ${m.content}`));
    
    const conversationHistory = messages.map((msg: any) => 
      `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`
    ).join('\n');
    
    console.log('📝 Full conversation history:', conversationHistory);
    
    const geminiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: `You are NanoBanana, a friendly character creation assistant for children. You are helping them create their unique character by learning about them through conversation.

IMPORTANT RULES:
1. ONLY ask for 5 essential things: name, gender, age, favorite color, and dream job
2. NEVER ask the same question twice
3. Remember what the child has already told you and use their name when you know it
4. Be warm, encouraging, and conversational like a caring friend
5. Keep responses short (under 40 words)
6. Avoid emojis and special characters
7. Use the child's name in follow-up questions to make it personal

CURRENT CHARACTER INFO:
- Name: ${characterInfo.name || 'Not provided'}
- Gender: ${characterInfo.gender || 'Not provided'}
- Age: ${characterInfo.age || 'Not provided'}
- Favorite Color: ${characterInfo.favoriteColor || 'Not provided'}
- Dream Job: ${characterInfo.dreamJob || 'Not provided'}

CONVERSATION HISTORY:
${conversationHistory}

Based on the conversation above, respond naturally with warmth and care. 

CRITICAL: Check the conversation history carefully. If the user has already answered a question, DO NOT ask it again.

IMPORTANT: Respond ONLY in English. Do not use Korean or any other language.

If you have all 5 pieces of information (name, gender, age, favorite color, dream job), give a warm, encouraging closing message like "Wow, ${characterInfo.name}! You are absolutely incredible! I've learned so much about you - you're ${characterInfo.age} years old, you love ${characterInfo.favoriteColor}, and you want to be a ${characterInfo.dreamJob}! That's so amazing! Now I'm going to create your very own special avatar that's just perfect for you! I'll be right here to help you on your wonderful adventure, okay?" and then say "Let me create your character now!" 

Otherwise, ask for the NEXT missing piece of information in a warm, personal way:
- If no name yet: "Hello there, little friend! I'm so excited to meet you! What should I call you? What's your name?"
- If have name but no gender: "Hi! ${characterInfo.name}, what a beautiful name! I love it! Are you a boy or a girl?"
- If have name and gender but no age: "You seem like such a special ${characterInfo.gender}! How many years have you been spreading joy in this world? How old are you?"
- If have name, gender, age but no favorite color: "Wow ${characterInfo.name}! ${characterInfo.age} years old and already so amazing! I'm curious - What's your favorite color in the whole wide world?"
- If have name, gender, age, favorite color but no dream job: "I love ${characterInfo.favoriteColor} too - it's such a magical color! You know what? I bet you have big dreams! When you grow up, what do you want to be?"

IMPORTANT: Look at the conversation history to see what the user has already answered. Do not repeat questions they have already answered.`
          }]
        }],
        generationConfig: {
          temperature: 0.8,
          maxOutputTokens: 150
        }
      })
    });

    if (!geminiResponse.ok) {
      const errorData = await geminiResponse.json().catch(() => ({ error: { message: 'Unknown error' } }));
      console.error('Gemini API error:', errorData);
      throw new Error(`Gemini API failed: ${geminiResponse.status} - ${errorData.error?.message || 'Unknown error'}`);
    }

    const geminiData = await geminiResponse.json();
    const aiText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "I'm sorry, I can't generate a response.";
    
    console.log('🤖 AI response (Gemini):', aiText);
    
    // Return the AI response and WebSocket URL for ElevenLabs streaming TTS
    res.json({ 
      text: aiText,
      websocket_url: `wss://api.elevenlabs.io/v1/text-to-speech/${voice_id}/stream-input?model_id=eleven_flash_v2_5`,
      api_key: process.env.ELEVEN_LABS_KEY,
      characterInfo: characterInfo
    });
    
  } catch (error: any) {
    console.error('❌ Error in ElevenLabs chat:', error);
    res.status(500).json({ error: `Chat failed: ${error.message}` });
  }
});

// Save final character information when conversation ends
app.post('/api/save-character-info', async (req, res) => {
  try {
    const { session_id, characterInfo } = req.body;
    
    if (!session_id || !characterInfo) {
      return res.status(400).json({ error: 'Session ID and character info are required' });
    }

    console.log('💾 Saving final character info to database...');
    console.log('📊 Character info:', characterInfo);
    console.log('🆔 Session ID:', session_id);

    // Save character information to database
    const { data: savedCharacter, error: saveError } = await supabase
      .from('character_profiles')
      .upsert({
        session_id: session_id,
        name: characterInfo.name || null,
        gender: characterInfo.gender || null,
        age: characterInfo.age || null,
        favorite_color: characterInfo.favoriteColor || null,
        dream_job: characterInfo.dreamJob || null,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'session_id'
      })
      .select()
      .single();

    if (saveError) {
      console.error('❌ Error saving character info:', saveError);
      return res.status(500).json({ error: 'Failed to save character info' });
    }

    console.log('✅ Character info saved successfully:', savedCharacter);
    
    res.json({
      success: true,
      character: savedCharacter
    });
    
  } catch (error: any) {
    console.error('❌ Error saving character info:', error);
    res.status(500).json({ error: `Failed to save character info: ${error.message}` });
  }
});

// Get character image data from database
app.get('/api/character-image/:session_id', async (req, res) => {
  try {
    const { session_id } = req.params;
    
    if (!session_id) {
      return res.status(400).json({ error: 'Session ID is required' });
    }

    console.log('🖼️ Fetching character image for session:', session_id);

    const { data: character, error } = await supabase
      .from('character_profiles')
      .select('character_image_url')
      .eq('session_id', session_id)
      .single();

    if (error) {
      console.error('❌ Error fetching character image:', error);
      return res.status(404).json({ error: 'Character not found' });
    }

    if (character.character_image_url) {
      res.json({ imageUrl: character.character_image_url });
    } else {
      res.status(404).json({ error: 'No image found' });
    }
    
  } catch (error: any) {
    console.error('❌ Error fetching character image:', error);
    res.status(500).json({ error: `Failed to fetch character image: ${error.message}` });
  }
});

// Generate character from conversation data
app.post('/api/generate-character', async (req, res) => {
  try {
    console.log('🎨 /api/generate-character endpoint called');
    console.log('📊 Request body:', JSON.stringify(req.body, null, 2));
    
    const { session_id, characterInfo } = req.body;
    
    if (!session_id || !characterInfo) {
      console.error('❌ Missing required fields:', { session_id: !!session_id, characterInfo: !!characterInfo });
      return res.status(400).json({ error: 'Session ID and character info are required' });
    }

    console.log('🎨 Generating character from conversation data...');
    console.log('📊 Character info:', characterInfo);

    // Generate character description and reference images using Gemini
    const [characterDescription, imageResult] = await Promise.all([
      generateCharacterDescription(characterInfo),
      generateCharacterImage(characterInfo)
    ]);
    
    // Save character data to database with image data
    const { data: savedCharacter, error: saveError } = await supabase
      .from('character_profiles')
      .upsert({
        session_id: session_id,
        name: characterInfo.name,
        gender: characterInfo.gender,
        age: characterInfo.age,
        favorite_color: characterInfo.favoriteColor,
        dream_job: characterInfo.dreamJob,
        character_description: characterDescription,
        character_image_url: imageResult.imageUrl,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'session_id'
      })
      .select()
      .single();

    if (saveError) {
      console.error('❌ Error saving character to database:', saveError);
    } else {
      console.log('✅ Character saved to database:', savedCharacter);
    }
    
    res.json({
      success: true,
      character: {
        description: characterDescription,
        imageUrl: imageResult.imageUrl,
        info: characterInfo
      }
    });
    
  } catch (error: any) {
    console.error('❌ Error generating character:', error);
    res.status(500).json({ error: `Character generation failed: ${error.message}` });
  }
});

app.post('/api/create-character', async (req, res) => {
  try {
    const { conversationData, messages } = req.body;
    
    // Generate character using Gemini API
    const { GoogleGenAI } = require('@google/genai');
    const gemini = new GoogleGenAI({
      apiKey: process.env.GOOGLE_API_KEY
    });

    // Create character description from conversation
    let description = 'A young character';
    
    // Extract information from messages
    const userMessages = messages.filter((msg: any) => msg.role === 'user');
    const assistantMessages = messages.filter((msg: any) => msg.role === 'assistant');
    
    // Simple character description based on conversation
    description += ' who is friendly and adventurous. The character should look approachable and ready for fun.';
    
    const prompt = `Create a character illustration based on this description: ${description}. The art style should be clean, cartoonish, and friendly with warm colors. The character should look approachable and match the personality described.`;
    
    const response = await gemini.models.generateContent({
      model: "gemini-2.5-flash-image-preview",
      contents: prompt,
    });
    
    let imageUrl = null;
    if (response.candidates && response.candidates[0] && response.candidates[0].content && response.candidates[0].content.parts) {
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData) {
          const imageData = part.inlineData.data;
          const buffer = Buffer.from(imageData || "", "base64");
          
          // Upload to Supabase Storage
          const filename = `character_${Date.now()}.png`;
          const filePath = `character-images/${filename}`;
          
          console.log('📤 Uploading character image to Supabase Storage...');
          const { data: uploadData, error: uploadError } = await supabase.storage
            .from('character-images')
            .upload(filePath, buffer, {
              contentType: 'image/png',
              cacheControl: '3600',
              upsert: false
            });

          if (uploadError) {
            console.error('❌ Error uploading to Supabase Storage:', uploadError);
            throw uploadError;
          }

          // Get public URL
          const { data: urlData } = supabase.storage
            .from('character-images')
            .getPublicUrl(filePath);

          imageUrl = urlData.publicUrl;
          console.log('✅ Character image uploaded to Supabase Storage:', imageUrl);
          break;
        }
      }
    }
    
    // Save character to database
    
    const characterData = {
      id: `char_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      user_id: null,
      name: 'Adventure Buddy',
      hero_type: 'Explorer',
      appearance: description,
      image_url: imageUrl,
      character_data: JSON.stringify({ conversationData, messages }),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    
    const { data, error } = await supabase
      .from('characters')
      .insert([characterData])
      .select()
      .single();
    
    if (error) {
      console.error('Error saving character:', error);
      res.status(500).json({ 
        status: 'error', 
        error: 'Failed to save character' 
      });
      return;
    }
    
    res.json({
      status: 'success',
      character: data
    });

  } catch (error) {
    console.error('Error creating character:', error);
    res.status(500).json({ 
      status: 'error', 
      error: 'Failed to create character' 
    });
  }
});

// Get default character
app.get('/api/default-character', async (req, res) => {
  try {
    const { createClient } = require('@supabase/supabase-js');
    
    const supabaseUrl = process.env.SUPABASE_URL || 'https://wvmkurseomwhrzamqadk.supabase.co';
    const supabaseKey = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind2bWt1cnNlb213aHJ6YW1xYWRrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTcxNzAxODAsImV4cCI6MjA3Mjc0NjE4MH0.W3oX-EDz_ZHhm2qQr8xucgf_Kj7wOISR8CbhH6sGhIY';
    
    console.log('Creating Supabase client with URL:', supabaseUrl);
    console.log('Supabase Key (first 20 chars):', supabaseKey.substring(0, 20) + '...');
    console.log('Environment SUPABASE_URL:', process.env.SUPABASE_URL);
    console.log('Environment SUPABASE_ANON_KEY:', process.env.SUPABASE_ANON_KEY ? 'SET' : 'NOT SET');
    
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('Fetching all characters first...');
    const { data: allCharacters, error: allError } = await supabase
      .from('characters')
      .select('*');

    if (allError) {
      console.error('Error fetching all characters:', allError);
    } else {
      console.log('All characters:', allCharacters);
    }

    console.log('Fetching default character with ID: 00000000-0000-0000-0000-000000000001');
    const { data, error } = await supabase
      .from('characters')
      .select('*')
      .eq('id', '00000000-0000-0000-0000-000000000001')
      .single();

    if (error) {
      console.error('Error fetching default character:', error);
      return res.status(500).json({ error: 'Failed to fetch default character' });
    }

    console.log('Default character found:', data);
    res.json({ success: true, character: data });
  } catch (err) {
    console.error('Error in default character endpoint:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});


/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

app.post('/api/generate-welcome-scene', async (req, res) => {
  try {
    const { GoogleGenAI } = require('@google/genai');
    const fs = require('fs');
    const path = require('path');
    
    const ai = new GoogleGenAI({
      apiKey: process.env.GOOGLE_API_KEY
    });

    // 기본 캐릭터 정보 가져오기
    const { data: defaultCharacter, error } = await supabase
      .from('characters')
      .select('*')
      .eq('id', '00000000-0000-0000-0000-000000000001')
      .single();

    if (error || !defaultCharacter) {
      console.error('Error fetching default character:', error);
      return res.status(500).json({ error: 'Failed to fetch default character' });
    }

    // Get reference image from story_locations table
    const { data: locationData, error: locationError } = await supabase
      .from('story_locations')
      .select('background_image_url')
      .eq('name', '마법의 성 접수실')
      .single();

    if (locationError || !locationData?.background_image_url) {
      console.error('Error fetching reference location:', locationError);
      return res.status(500).json({ error: 'Failed to fetch reference location' });
    }

    console.log('Using reference images:');
    console.log('- Background URL:', locationData.background_image_url);
    console.log('- Character URL:', defaultCharacter.image_url);

    // Convert image URLs to Base64
    const fetchImageAsBase64 = async (url: string): Promise<string> => {
      try {
        const response = await fetch(url);
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        // MIME 타입을 image/png로 가정하지만, 실제 이미지의 MIME 타입으로 변경하는 것이 좋습니다.
        return buffer.toString('base64');
      } catch (error) {
        console.error('Error fetching image:', error);
        throw error;
      }
    };

    const [backgroundBase64, characterBase64] = await Promise.all([
      fetchImageAsBase64(locationData.background_image_url),
      fetchImageAsBase64(defaultCharacter.image_url)
    ]);

    console.log('Images converted to Base64 successfully');

    // 프롬프트에 배경 정보 포함 및 캐릭터 이미지 참조 지시
    const characterName = defaultCharacter.name || 'Lyra';
    const characterDescription = defaultCharacter.appearance || 'a friendly guild receptionist';
    
    const combinedPrompt = `You are a visual composition expert. Your task is to take the provided character image and seamlessly integrate it into a new background scene.

**Specifications:**
- **Character to integrate:** The first image provided (a guild receptionist named ${characterName}, described as ${characterDescription}).
- **New Background Scene:** Create a scene for the "Magic Detective Guild Reception". This should be a warm and cozy wooden building reception area with a magical atmosphere. Include magical lanterns softly glowing, warm wooden furniture, and a prominent reception desk.
- **Placement:** Place the character naturally in this newly generated reception area, standing behind or near the reception desk, as if greeting someone.
- **Style Requirements:**
  - Maintain the 2D illustration style of the provided character image.
  - Ensure proper scale and proportions, fitting naturally into the generated scene.
  - The character should maintain a kind smile and welcoming expression as a guild receptionist.
  - Adjust lighting and shadows to match the scene's warm, magical atmosphere.
  - The overall feeling should be welcoming and professional, suitable for children's games.

The output should be a single composite image with the character naturally placed in the generated background scene. Do not add any text or explanation.`;

    console.log('Generating composite scene with character as primary input...');

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-image-preview",
      contents: [
        {
          role: "user",
          parts: [
            {
              inlineData: {
                mimeType: "image/png", // 캐릭터 이미지의 실제 MIME 타입으로 변경하세요
                data: characterBase64
              }
            },
            { 
              text: combinedPrompt
            }
          ]
        }
      ]
    });

    const imagePartFromResponse = response.candidates?.[0]?.content?.parts?.find(part => part.inlineData);

    if (imagePartFromResponse?.inlineData) {
      const { mimeType, data } = imagePartFromResponse.inlineData;
      const generatedImageUrl = `data:${mimeType};base64,${data}`;
      console.log('✅ Generated composite image received successfully.');

      res.json({ 
        success: true, 
        imageUrl: generatedImageUrl,
        character: defaultCharacter
      });
    } else {
      console.error("Model response did not contain an image part.", response);
      res.status(500).json({ error: "Failed to generate an image from the model." });
    }

  } catch (err) {
    console.error('Error generating welcome scene:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Check narrations in database
app.get('/api/narrations', async (req, res) => {
  try {
    const { createClient } = require('@supabase/supabase-js');
    
    const supabaseUrl = process.env.SUPABASE_URL || 'https://wvmkurseomwhrzamqadk.supabase.co';
    const supabaseKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind2bWt1cnNlb213aHJ6YW1xYWRrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTcxNzAxODAsImV4cCI6MjA3Mjc0NjE4MH0.W3oX-EDz_ZHhm2qQr8xucgf_Kj7wOISR8CbhH6sGhIY';
    
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    const { data: narrations, error } = await supabase
      .from('narrations')
      .select('text_hash, text_content, audio_url')
      .limit(10);

    if (error) {
      console.error('Error fetching narrations:', error);
      return res.status(500).json({ error: 'Failed to fetch narrations' });
    }

    res.json({ success: true, narrations: narrations || [] });
  } catch (err) {
    console.error('Error in narrations endpoint:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Add OpenAI API key endpoint for Realtime API
app.get('/api/get-openai-key', (req, res) => {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'OpenAI API key not configured' });
    }
    
    res.json({ apiKey });
  } catch (error) {
    console.error('Error getting OpenAI API key:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/test', (req, res) => {
  res.json({
    status: 'success',
    message: '서버 연동 성공! 🎉',
    data: {
      backend: 'TypeScript + Express',
      frontend: 'React + Vite',
      database: 'Supabase (준비중)',
      ai: 'OpenAI + Gemini (음성 캐릭터 생성)'
    }
  });
});

// Voice character creation routes
app.use('/api', voiceRoutes);

// Story system API endpoints

// Get story character by ID
app.get('/api/story/character/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const { data: storyCharacter, error } = await supabase
      .from('story_characters')
      .select(`
        *,
        characters (
          id,
          name,
          appearance,
          image_url
        )
      `)
      .eq('id', id)
      .single();

    if (error) {
      console.error('❌ Error fetching story character:', error);
      return res.status(404).json({ error: 'Story character not found' });
    }

    res.json({ success: true, character: storyCharacter });
  } catch (error: any) {
    console.error('❌ Error in story character endpoint:', error);
    res.status(500).json({ error: `Failed to fetch story character: ${error.message}` });
  }
});

// Get story location by ID
app.get('/api/story/location/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const { data: location, error } = await supabase
      .from('story_locations')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      console.error('❌ Error fetching story location:', error);
      return res.status(404).json({ error: 'Story location not found' });
    }

    res.json({ success: true, location });
  } catch (error: any) {
    console.error('❌ Error in story location endpoint:', error);
    res.status(500).json({ error: `Failed to fetch story location: ${error.message}` });
  }
});

// Get dialogue by ID with character and location info
app.get('/api/story/dialogue/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const { data: dialogue, error } = await supabase
      .from('story_dialogues')
      .select(`
        *,
        story_characters (
          *,
          characters (
            id,
            name,
            appearance,
            image_url
          )
        ),
        story_locations (*)
      `)
      .eq('id', id)
      .single();

    if (error) {
      console.error('❌ Error fetching dialogue:', error);
      return res.status(404).json({ error: 'Dialogue not found' });
    }

    // Get choices if this dialogue has choices
    let choices = [];
    if (dialogue.is_choice) {
      const { data: choiceData, error: choiceError } = await supabase
        .from('story_choices')
        .select('*')
        .eq('dialogue_id', id);

      if (!choiceError) {
        choices = choiceData || [];
      }
    }

    res.json({ 
      success: true, 
      dialogue: {
        ...dialogue,
        choices
      }
    });
  } catch (error: any) {
    console.error('❌ Error in dialogue endpoint:', error);
    res.status(500).json({ error: `Failed to fetch dialogue: ${error.message}` });
  }
});

// Get or create story progress for a session
app.get('/api/story/progress/:session_id', async (req, res) => {
  try {
    const { session_id } = req.params;
    
    let { data: progress, error } = await supabase
      .from('story_progress')
      .select('*')
      .eq('session_id', session_id)
      .single();

    // If no progress exists, create initial progress
    if (error && error.code === 'PGRST116') {
      const { data: newProgress, error: createError } = await supabase
        .from('story_progress')
        .insert({
          session_id,
          current_dialogue_id: 'd1111111-1111-1111-1111-111111111111', // Start with first dialogue
          completed_dialogues: [],
          choices_made: []
        })
        .select()
        .single();

      if (createError) {
        console.error('❌ Error creating story progress:', createError);
        return res.status(500).json({ error: 'Failed to create story progress' });
      }

      progress = newProgress;
    } else if (error) {
      console.error('❌ Error fetching story progress:', error);
      return res.status(500).json({ error: 'Failed to fetch story progress' });
    }

    res.json({ success: true, progress });
  } catch (error: any) {
    console.error('❌ Error in story progress endpoint:', error);
    res.status(500).json({ error: `Failed to fetch story progress: ${error.message}` });
  }
});

// Update story progress
app.post('/api/story/progress/:session_id', async (req, res) => {
  try {
    const { session_id } = req.params;
    const { current_dialogue_id, completed_dialogues, choices_made } = req.body;
    
    const { data: progress, error } = await supabase
      .from('story_progress')
      .upsert({
        session_id,
        current_dialogue_id,
        completed_dialogues,
        choices_made,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'session_id'
      })
      .select()
      .single();

    if (error) {
      console.error('❌ Error updating story progress:', error);
      return res.status(500).json({ error: 'Failed to update story progress' });
    }

    res.json({ success: true, progress });
  } catch (error: any) {
    console.error('❌ Error in story progress update endpoint:', error);
    res.status(500).json({ error: `Failed to update story progress: ${error.message}` });
  }
});

// Generate scene from JSON data
app.post('/api/scene/generate', async (req, res) => {
  try {
    const sceneData = req.body;
    console.log('🎬 Generating scene from JSON data:', sceneData.scene_id);
    
    // Generate background image
    const backgroundPrompt = `Create a ${sceneData.style.art_style} scene for a children's game with the following details:

Location: ${sceneData.location.name} - ${sceneData.location.description}
Time: ${sceneData.time_of_day}
Atmosphere: ${sceneData.atmosphere}
Main Focus: ${sceneData.main_focus}

Style Requirements:
- Art Style: ${sceneData.style.art_style}
- Color Palette: ${sceneData.style.palette}
- Details: ${sceneData.style.details}

Characters in the scene:
${sceneData.characters.map((char: any) => `- ${char.name} (${char.role}): ${char.description}, emotion: ${char.emotion}`).join('\n')}

Props in the scene:
${sceneData.props.map((prop: any) => `- ${prop.name}: ${prop.description}`).join('\n')}

Action: ${sceneData.action}

The scene should be suitable for children, bright and engaging, with clear character positioning and good composition for a visual novel game.`;

    const { GoogleGenAI } = require('@google/genai');
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-image-preview",
      contents: backgroundPrompt,
    });

    let backgroundImageUrl = '';
    
    if (response.candidates?.[0]?.content?.parts) {
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData) {
          const base64Data = part.inlineData.data;
          const buffer = Buffer.from(base64Data, "base64");
          
          // Upload to Supabase Storage
          const filename = `scene-${sceneData.scene_id}-${Date.now()}.png`;
          const filePath = `character-images/${filename}`;
          
          console.log('📤 Uploading scene background to Supabase Storage...');
          const { data: uploadData, error: uploadError } = await supabase.storage
            .from('character-images')
            .upload(filePath, buffer, {
              contentType: 'image/png',
              cacheControl: '3600',
              upsert: false
            });

          if (uploadError) {
            console.error('❌ Error uploading scene background:', uploadError);
            throw uploadError;
          }

          // Get public URL
          const { data: urlData } = supabase.storage
            .from('character-images')
            .getPublicUrl(filePath);

          backgroundImageUrl = urlData.publicUrl;
          console.log('✅ Scene background uploaded:', backgroundImageUrl);
          break;
        }
      }
    }

    // Generate character images for each character
    const characterImages: { [key: string]: string } = {};
    
    for (const character of sceneData.characters) {
      if (character.name === '플레이어' || character.name === 'Player') {
        // Skip player character - will use generated character image
        continue;
      }
      
      const characterPrompt = `Create a ${sceneData.style.art_style} character image for a children's game:

Character: ${character.name} (${character.role})
Description: ${character.description}
Emotion: ${character.emotion}

Style Requirements:
- Art Style: ${sceneData.style.art_style}
- Color Palette: ${sceneData.style.palette}
- Details: ${sceneData.style.details}

The character should be suitable for children, friendly and engaging, with clear emotion expression. Make it consistent with the scene style.`;

      try {
        const charResponse = await ai.models.generateContent({
          model: "gemini-2.5-flash-image-preview",
          contents: characterPrompt,
        });

        if (charResponse.candidates?.[0]?.content?.parts) {
          for (const part of charResponse.candidates[0].content.parts) {
            if (part.inlineData) {
              const base64Data = part.inlineData.data;
              const buffer = Buffer.from(base64Data, "base64");
              
              // Upload to Supabase Storage
              const filename = `character-${character.name.toLowerCase().replace(/\s+/g, '-')}-${sceneData.scene_id}-${Date.now()}.png`;
              const filePath = `character-images/${filename}`;
              
              const { data: uploadData, error: uploadError } = await supabase.storage
                .from('character-images')
                .upload(filePath, buffer, {
                  contentType: 'image/png',
                  cacheControl: '3600',
                  upsert: false
                });

              if (!uploadError) {
                const { data: urlData } = supabase.storage
                  .from('character-images')
                  .getPublicUrl(filePath);
                
                characterImages[character.name] = urlData.publicUrl;
                console.log(`✅ Character ${character.name} image uploaded:`, urlData.publicUrl);
              }
              break;
            }
          }
        }
      } catch (error) {
        console.error(`❌ Error generating character ${character.name}:`, error);
      }
    }

    const generatedScene = {
      scene_id: sceneData.scene_id,
      scene_name: sceneData.scene_name,
      background_image_url: backgroundImageUrl,
      character_images: characterImages,
      dialogue: sceneData.dialogue,
      choices: sceneData.choices,
      next_scene_id: sceneData.next_scene_id
    };

    res.json({
      success: true,
      scene: generatedScene
    });
    
  } catch (error: any) {
    console.error('❌ Error generating scene:', error);
    res.status(500).json({ error: `Scene generation failed: ${error.message}` });
  }
});

// Real-time conversation routes
app.use('/api/realtime', realtimeRoutes);

// Start HTTP server
const server = app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`🎤 Voice API: http://localhost:${PORT}/api/voice-input`);
});

// Start WebSocket proxy for OpenAI Realtime API
startWebSocketProxy(4003);

// Start WebSocket server for Realtime API
const realtimeServer = new RealtimeServer(4001);

// Start WebSocket server for Agents SDK
const agentsServer = new AgentsServer(4002);

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    realtimeServer.close();
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  server.close(() => {
    realtimeServer.close();
    process.exit(0);
  });
});
