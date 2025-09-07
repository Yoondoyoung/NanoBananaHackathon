import express from 'express';
import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';
import multer from 'multer';
import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';

const router = express.Router();

// OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL || 'https://wvmkurseomwhrzamqadk.supabase.co',
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_ANON_KEY || ''
);

// ElevenLabs client
const elevenlabs = new ElevenLabsClient({
  apiKey: process.env.ELEVEN_LABS_KEY,
});

// Multer for file uploads
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Store conversation data for character creation
interface ConversationData {
  name?: string;
  age?: string;
  interests?: string[];
  personality?: string;
  favoriteColor?: string;
  dreamJob?: string;
  hobbies?: string[];
  messages: Array<{
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
  }>;
}

// In-memory storage for conversation data (in production, use Redis or database)
const conversationSessions = new Map<string, ConversationData>();

// POST /api/realtime/start - Start a real-time conversation session
router.post('/start', async (req, res) => {
  try {
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Initialize conversation data
    const conversationData: ConversationData = {
      messages: []
    };
    
    conversationSessions.set(sessionId, conversationData);
    
    // System prompt for character creation conversation
    const systemPrompt = `You are NanoBanana, a friendly and enthusiastic adventure companion. Your goal is to help create a custom character for the user through natural conversation.

Guidelines:
1. Be warm, friendly, and encouraging
2. Ask questions naturally to learn about the user
3. Gather information about: name, age, interests, personality, favorite color, dream job, hobbies
4. Keep responses conversational and engaging
5. Don't ask too many questions at once - make it feel like a natural chat
6. Show genuine interest in their answers
7. After gathering enough information, suggest creating their character

Start by welcoming them and asking their name in a friendly way.`;

    // Add system message
    conversationData.messages.push({
      role: 'assistant',
      content: systemPrompt,
      timestamp: new Date()
    });

    res.json({
      success: true,
      sessionId,
      message: 'Real-time conversation session started'
    });
  } catch (error) {
    console.error('Error starting real-time session:', error);
    res.status(500).json({ error: 'Failed to start conversation session' });
  }
});

// POST /api/realtime/voice-message - Send voice message and get AI voice response
router.post('/voice-message', upload.single('audio'), async (req, res) => {
  try {
    const { sessionId } = req.body;
    
    if (!sessionId || !req.file) {
      return res.status(400).json({ error: 'Session ID and audio file are required' });
    }
    
    const conversationData = conversationSessions.get(sessionId);
    if (!conversationData) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    // Transcribe audio to text using OpenAI Whisper
    const transcription = await openai.audio.transcriptions.create({
      file: new File([req.file.buffer], 'audio.webm', { type: 'audio/webm' }),
      model: 'whisper-1',
      language: 'en'
    });
    
    const userMessage = transcription.text;
    console.log('Transcribed user message:', userMessage);
    
    // Add user message to conversation
    conversationData.messages.push({
      role: 'user',
      content: userMessage,
      timestamp: new Date()
    });
    
    // Prepare messages for OpenAI API
    const messages = conversationData.messages.map(msg => ({
      role: msg.role,
      content: msg.content
    }));
    
    // Get AI response
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: messages,
      max_tokens: 150,
      temperature: 0.8
    });
    
    const aiResponse = completion.choices[0]?.message?.content || 'Sorry, I didn\'t understand that. Could you tell me more?';
    
    // Add AI response to conversation
    conversationData.messages.push({
      role: 'assistant',
      content: aiResponse,
      timestamp: new Date()
    });
    
    // Extract character information from conversation
    extractCharacterInfo(conversationData, userMessage);
    
    // Generate voice response using ElevenLabs
    const voiceId = 'EXAVITQu4vr4xnSDxMaL'; // English voice
    const audio = await elevenlabs.textToSpeech.convert(voiceId, {
      text: aiResponse,
      modelId: 'eleven_monolingual_v1',
      outputFormat: 'mp3_44100_128'
    });
    
    // Convert audio to buffer
    const chunks: Buffer[] = [];
    for await (const chunk of audio) {
      chunks.push(Buffer.from(chunk));
    }
    const audioBuffer = Buffer.concat(chunks);
    
    // Convert to base64 for JSON response
    const base64Audio = audioBuffer.toString('base64');
    
    res.json({
      success: true,
      response: aiResponse,
      audioData: base64Audio,
      contentType: 'audio/mpeg',
      conversationData: {
        name: conversationData.name,
        age: conversationData.age,
        interests: conversationData.interests,
        personality: conversationData.personality,
        favoriteColor: conversationData.favoriteColor,
        dreamJob: conversationData.dreamJob,
        hobbies: conversationData.hobbies
      }
    });
  } catch (error) {
    console.error('Error processing voice message:', error);
    res.status(500).json({ error: 'Failed to process voice message' });
  }
});

// POST /api/realtime/message - Send a text message and get AI response
router.post('/message', async (req, res) => {
  try {
    const { sessionId, message } = req.body;
    
    if (!sessionId || !message) {
      return res.status(400).json({ error: 'Session ID and message are required' });
    }
    
    const conversationData = conversationSessions.get(sessionId);
    if (!conversationData) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    // Add user message
    conversationData.messages.push({
      role: 'user',
      content: message,
      timestamp: new Date()
    });
    
    // Prepare messages for OpenAI API
    const messages = conversationData.messages.map(msg => ({
      role: msg.role,
      content: msg.content
    }));
    
    // Get AI response
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: messages,
      max_tokens: 150,
      temperature: 0.8
    });
    
    const aiResponse = completion.choices[0]?.message?.content || 'Sorry, I didn\'t understand that. Could you tell me more?';
    
    // Add AI response
    conversationData.messages.push({
      role: 'assistant',
      content: aiResponse,
      timestamp: new Date()
    });
    
    // Extract character information from conversation
    extractCharacterInfo(conversationData, message);
    
    res.json({
      success: true,
      response: aiResponse,
      conversationData: {
        name: conversationData.name,
        age: conversationData.age,
        interests: conversationData.interests,
        personality: conversationData.personality,
        favoriteColor: conversationData.favoriteColor,
        dreamJob: conversationData.dreamJob,
        hobbies: conversationData.hobbies
      }
    });
  } catch (error) {
    console.error('Error processing message:', error);
    res.status(500).json({ error: 'Failed to process message' });
  }
});

// POST /api/realtime/create-character - Create character based on conversation
router.post('/create-character', async (req, res) => {
  try {
    const { sessionId } = req.body;
    
    const conversationData = conversationSessions.get(sessionId);
    if (!conversationData) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    // Generate character using Gemini API
    const { GoogleGenAI } = require('@google/genai');
    const ai = new GoogleGenAI({
      apiKey: process.env.GOOGLE_API_KEY
    });
    
    // Create character description from conversation data
    const characterDescription = createCharacterDescription(conversationData);
    
    // Generate character image
    const prompt = `Create a character illustration based on this description: ${characterDescription}. The art style should be clean, cartoonish, and friendly with warm colors. The character should look approachable and match the personality described.`;
    
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-image-preview",
      contents: prompt,
    });
    
    let imageUrl = null;
    if (response.candidates && response.candidates[0] && response.candidates[0].content && response.candidates[0].content.parts) {
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData) {
          const imageData = part.inlineData.data;
          const buffer = Buffer.from(imageData, "base64");
          
          // Save character image
          const filename = `character_${Date.now()}.png`;
          const filepath = require('path').join(__dirname, '..', '..', 'public', 'character-images', filename);
          
          // Ensure directory exists
          const fs = require('fs');
          const dir = require('path').dirname(filepath);
          if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
          }
          
          fs.writeFileSync(filepath, buffer);
          imageUrl = `/api/character-images/${filename}`;
          break;
        }
      }
    }
    
    // Save character to database
    const characterData = {
      id: `char_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      user_id: null, // In a real app, this would be the logged-in user's ID
      name: conversationData.name || 'Adventure Buddy',
      hero_type: conversationData.dreamJob || 'Explorer',
      appearance: characterDescription,
      image_url: imageUrl,
      character_data: JSON.stringify(conversationData),
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
      return res.status(500).json({ error: 'Failed to save character' });
    }
    
    // Clean up session
    conversationSessions.delete(sessionId);
    
    res.json({
      success: true,
      character: data,
      imageUrl: imageUrl
    });
  } catch (error) {
    console.error('Error creating character:', error);
    res.status(500).json({ error: 'Failed to create character' });
  }
});

// Helper function to extract character information from conversation
function extractCharacterInfo(conversationData: ConversationData, message: string) {
  const lowerMessage = message.toLowerCase();
  
  // Extract name
  if (lowerMessage.includes('my name is') || lowerMessage.includes('i\'m') || lowerMessage.includes('i am')) {
    const nameMatch = message.match(/(?:my name is|i'm|i am)\s+([a-zA-Z\s]+)/i);
    if (nameMatch) {
      conversationData.name = nameMatch[1].trim();
    }
  }
  
  // Extract age
  if (lowerMessage.includes('years old') || lowerMessage.includes('age')) {
    const ageMatch = message.match(/(\d+)\s*years?\s*old/i);
    if (ageMatch) {
      conversationData.age = ageMatch[1];
    }
  }
  
  // Extract interests
  if (lowerMessage.includes('like') || lowerMessage.includes('love') || lowerMessage.includes('enjoy')) {
    const interests = [];
    if (lowerMessage.includes('music')) interests.push('music');
    if (lowerMessage.includes('art')) interests.push('art');
    if (lowerMessage.includes('sports')) interests.push('sports');
    if (lowerMessage.includes('reading')) interests.push('reading');
    if (lowerMessage.includes('gaming')) interests.push('gaming');
    if (lowerMessage.includes('cooking')) interests.push('cooking');
    if (lowerMessage.includes('dancing')) interests.push('dancing');
    if (lowerMessage.includes('science')) interests.push('science');
    
    if (interests.length > 0) {
      conversationData.interests = [...(conversationData.interests || []), ...interests];
    }
  }
  
  // Extract personality traits
  if (lowerMessage.includes('shy') || lowerMessage.includes('outgoing') || lowerMessage.includes('funny') || 
      lowerMessage.includes('serious') || lowerMessage.includes('creative') || lowerMessage.includes('adventurous')) {
    conversationData.personality = message;
  }
  
  // Extract favorite color
  const colors = ['red', 'blue', 'green', 'yellow', 'purple', 'orange', 'pink', 'black', 'white', 'brown'];
  for (const color of colors) {
    if (lowerMessage.includes(`favorite color is ${color}`) || lowerMessage.includes(`like ${color}`)) {
      conversationData.favoriteColor = color;
      break;
    }
  }
  
  // Extract dream job
  if (lowerMessage.includes('want to be') || lowerMessage.includes('dream job') || lowerMessage.includes('when i grow up')) {
    conversationData.dreamJob = message;
  }
  
  // Extract hobbies
  if (lowerMessage.includes('hobby') || lowerMessage.includes('hobbies')) {
    conversationData.hobbies = message.split(/[,\s]+/).filter(word => word.length > 2);
  }
}

// Helper function to create character description
function createCharacterDescription(conversationData: ConversationData): string {
  let description = `A ${conversationData.age ? conversationData.age + '-year-old' : 'young'} character`;
  
  if (conversationData.name) {
    description += ` named ${conversationData.name}`;
  }
  
  if (conversationData.personality) {
    description += ` who is ${conversationData.personality}`;
  }
  
  if (conversationData.interests && conversationData.interests.length > 0) {
    description += ` and loves ${conversationData.interests.join(', ')}`;
  }
  
  if (conversationData.favoriteColor) {
    description += `. Their favorite color is ${conversationData.favoriteColor}`;
  }
  
  if (conversationData.dreamJob) {
    description += ` and dreams of becoming ${conversationData.dreamJob}`;
  }
  
  description += '. The character should look friendly, approachable, and ready for adventure.';
  
  return description;
}

export default router;
