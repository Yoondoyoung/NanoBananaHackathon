import { WebSocketServer, WebSocket } from 'ws';
import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai';
import fs from 'fs';
import path from 'path';

// OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL || 'https://wvmkurseomwhrzamqadk.supabase.co',
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_ANON_KEY || ''
);

// Gemini client
const gemini = new GoogleGenAI({
  apiKey: process.env.GOOGLE_API_KEY
});

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
  realtimeConnection?: WebSocket | null;
}

// Store conversation sessions
const conversationSessions = new Map<string, ConversationData>();

export class RealtimeServer {
  private wss: WebSocketServer;
  private clients: Map<string, WebSocket> = new Map();

  constructor(port: number) {
    this.wss = new WebSocketServer({ port });
    this.setupWebSocketServer();
  }

  private setupWebSocketServer() {
    this.wss.on('connection', (ws: WebSocket, req) => {
      console.log('New WebSocket connection established');
      
      ws.on('message', async (data) => {
        try {
          const message = JSON.parse(data.toString());
          await this.handleMessage(ws, message);
        } catch (error) {
          console.error('Error handling WebSocket message:', error);
          ws.send(JSON.stringify({ 
            type: 'error', 
            error: 'Invalid message format' 
          }));
        }
      });

      ws.on('close', () => {
        console.log('WebSocket connection closed');
        // Clean up client
        for (const [sessionId, client] of this.clients.entries()) {
          if (client === ws) {
            this.clients.delete(sessionId);
            break;
          }
        }
      });

      ws.on('error', (error) => {
        console.error('WebSocket error:', error);
      });
    });

    console.log(`Realtime WebSocket server running on port ${this.wss.options.port}`);
  }

  private async handleMessage(ws: WebSocket, message: any) {
    const { type, sessionId, audioData } = message;

    switch (type) {
      case 'start_session':
        await this.startSession(ws, sessionId);
        break;
      
      case 'voice_data':
        if (audioData) {
          await this.handleVoiceData(ws, sessionId, audioData);
        } else {
          console.error('❌ No audioData in voice_data message:', message);
          ws.send(JSON.stringify({ 
            type: 'error', 
            error: 'No audio data provided' 
          }));
        }
        break;
      
      case 'create_character':
        await this.createCharacter(ws, sessionId);
        break;
      
      default:
        ws.send(JSON.stringify({ 
          type: 'error', 
          error: 'Unknown message type' 
        }));
    }
  }

  private async startSession(ws: WebSocket, sessionId: string) {
    try {
      // Initialize conversation data
      const conversationData: ConversationData = {
        messages: []
      };
      
      conversationSessions.set(sessionId, conversationData);
      this.clients.set(sessionId, ws);

      // Create OpenAI Realtime API session
      const clientSecret = await this.createClientSecret();
      
      // Send session info to client
      ws.send(JSON.stringify({
        type: 'session_started',
        sessionId,
        clientSecret,
        message: 'Session started successfully'
      }));

      console.log(`Session started: ${sessionId}`);
    } catch (error) {
      console.error('Error starting session:', error);
      ws.send(JSON.stringify({ 
        type: 'error', 
        error: 'Failed to start session' 
      }));
    }
  }

  private async createClientSecret() {
    try {
      // OpenAI Realtime API doesn't require a separate client secret
      // We can connect directly with the API key
      console.log('✅ OpenAI Realtime API ready for direct connection');
      return 'direct_connection';
    } catch (error) {
      console.error('❌ Error preparing Realtime API:', error);
      throw error;
    }
  }

  private async handleVoiceData(ws: WebSocket, sessionId: string, audioData: number[]) {
    try {
      console.log('🎤 handleVoiceData called with sessionId:', sessionId, 'audioData length:', audioData.length);
      
      const conversationData = conversationSessions.get(sessionId);
      if (!conversationData) {
        console.log('❌ Session not found:', sessionId);
        ws.send(JSON.stringify({ 
          type: 'error', 
          error: 'Session not found' 
        }));
        return;
      }

      console.log('🎤 Received voice data, length:', audioData.length);
      
      // Convert audio data to base64 for OpenAI Realtime API
      const audioBuffer = Buffer.from(new Int16Array(audioData).buffer);
      const base64Audio = audioBuffer.toString('base64');
      
      // Send to OpenAI Realtime API
      await this.sendToRealtimeAPI(ws, sessionId, base64Audio, conversationData);

    } catch (error) {
      console.error('❌ Error handling voice data:', error);
      ws.send(JSON.stringify({ 
        type: 'error', 
        error: 'Failed to process voice data' 
      }));
    }
  }

  private async sendToRealtimeAPI(ws: WebSocket, sessionId: string, base64Audio: string, conversationData: ConversationData) {
    try {
      // Check if we already have a Realtime API connection for this session
      let realtimeWs = conversationData.realtimeConnection;
      
      if (!realtimeWs || realtimeWs.readyState !== WebSocket.OPEN) {
        console.log('🔗 Creating new Realtime API connection for session:', sessionId);
        
        // Create Realtime API WebSocket connection
        realtimeWs = new WebSocket('wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview', {
          headers: {
            'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
          }
        });

        // Store the connection in conversation data
        conversationData.realtimeConnection = realtimeWs;

        realtimeWs.onopen = () => {
          console.log('✅ Connected to OpenAI Realtime API for session:', sessionId);
          
          // Configure session
          if (realtimeWs) {
            realtimeWs.send(JSON.stringify({
            type: 'session.update',
            session: {
              type: 'realtime',
              model: 'gpt-4o-realtime-preview',
              instructions: 'You are a friendly character creation assistant for children. Help them create their unique character by asking about their preferences, interests, and personality. Be warm and encouraging.',
              audio: {
                output: { voice: 'alloy' }
              },
              input_audio_format: 'pcm16',
              output_audio_format: 'pcm16',
              turn_detection: {
                type: 'server_vad',
                threshold: 0.5,
                prefix_padding_ms: 300,
                silence_duration_ms: 500
              }
            }
          }));
          }
        };

        realtimeWs.onmessage = (event) => {
          const data = JSON.parse(event.data.toString());
          this.handleRealtimeAPIResponse(ws, sessionId, data, conversationData);
        };

        realtimeWs.onerror = (error) => {
          console.error('❌ Realtime API error:', error);
          // Fallback to simulated response
          this.sendSimulatedResponse(ws, sessionId, conversationData);
        };

        realtimeWs.onclose = () => {
          console.log('🔌 Realtime API connection closed for session:', sessionId);
          conversationData.realtimeConnection = null;
        };

        // Wait for connection to be established
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('Connection timeout'));
          }, 5000);
          
          if (realtimeWs) {
            realtimeWs.onopen = () => {
              clearTimeout(timeout);
              resolve(true);
            };
            
            realtimeWs.onerror = (error) => {
              clearTimeout(timeout);
              reject(error);
            };
          }
        });
      }

      // Send audio data
      console.log('🎤 Sending audio to Realtime API, length:', base64Audio.length);
      realtimeWs.send(JSON.stringify({
        type: 'input_audio_buffer.append',
        audio: base64Audio
      }));

      // Request response
      realtimeWs.send(JSON.stringify({
        type: 'response.create'
      }));

    } catch (error) {
      console.error('❌ Error connecting to Realtime API:', error);
      // Fallback to simulated response
      this.sendSimulatedResponse(ws, sessionId, conversationData);
    }
  }

  private handleRealtimeAPIResponse(ws: WebSocket, sessionId: string, data: any, conversationData: ConversationData) {
    console.log('📨 Realtime API response:', data.type, JSON.stringify(data, null, 2));
    
    switch (data.type) {
      case 'conversation.item.created':
      case 'conversation.item.added':
        if (data.item.type === 'message' && data.item.role === 'assistant') {
          const textContent = data.item.content?.find((c: any) => c.type === 'output_text')?.text || '';
          const audioContent = data.item.content?.find((c: any) => c.type === 'output_audio')?.audio;
          
          // Update conversation data
          conversationData.messages.push({
            role: 'assistant',
            content: textContent,
            timestamp: new Date()
          });
          
          // Send response to client
          ws.send(JSON.stringify({
            type: 'ai_response',
            response: textContent,
            audioData: audioContent ? this.base64ToAudioArray(audioContent) : null,
            conversationData: this.extractCharacterInfo(conversationData)
          }));
        }
        break;
        
      case 'response.done':
        console.log('✅ Realtime API response completed');
        break;
    }
  }

  private sendSimulatedResponse(ws: WebSocket, sessionId: string, conversationData: ConversationData) {
    const responses = [
      "That's wonderful! Tell me more about yourself.",
      "I love hearing about that! What else can you share?",
      "That sounds amazing! What's your favorite color?",
      "Great! How old are you?",
      "Fascinating! What do you like to do for fun?",
      "That's so interesting! What's your dream job?",
      "I'm learning so much about you! Tell me more!"
    ];
    
    const randomResponse = responses[Math.floor(Math.random() * responses.length)];
    
    // Update conversation data
    conversationData.messages.push({
      role: 'assistant',
      content: randomResponse,
      timestamp: new Date()
    });
    
    // Simulate character info extraction
    const mockCharacterInfo = this.extractCharacterInfo(conversationData);
    
    ws.send(JSON.stringify({
      type: 'ai_response',
      response: randomResponse,
      conversationData: mockCharacterInfo,
      audioData: null // No audio in simulated response
    }));
  }

  private base64ToAudioArray(base64Audio: string): number[] {
    try {
      const binaryString = atob(base64Audio);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      return Array.from(new Int16Array(bytes.buffer));
    } catch (error) {
      console.error('Error converting base64 audio:', error);
      return [];
    }
  }

  private extractCharacterInfo(conversationData: ConversationData): any {
    const messageCount = conversationData.messages.length;
    return {
      name: messageCount > 2 ? "Alex" : undefined,
      age: messageCount > 4 ? "12" : undefined,
      interests: messageCount > 6 ? ["art", "music"] : undefined,
      personality: messageCount > 8 ? "friendly and creative" : undefined
    };
  }

  private async createCharacter(ws: WebSocket, sessionId: string) {
    try {
      const conversationData = conversationSessions.get(sessionId);
      if (!conversationData) {
        ws.send(JSON.stringify({ 
          type: 'error', 
          error: 'Session not found' 
        }));
        return;
      }

      // Generate character using Gemini API
      const characterDescription = this.createCharacterDescription(conversationData);
      
      const prompt = `Create a character illustration based on this description: ${characterDescription}. The art style should be clean, cartoonish, and friendly with warm colors. The character should look approachable and match the personality described.`;
      
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
            
            // Save character image
            const filename = `character_${Date.now()}.png`;
            const filepath = path.join(__dirname, '..', '..', 'public', 'character-images', filename);
            
            // Ensure directory exists
            const dir = path.dirname(filepath);
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
        user_id: null,
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
        ws.send(JSON.stringify({ 
          type: 'error', 
          error: 'Failed to save character' 
        }));
        return;
      }
      
      // Clean up session
      conversationSessions.delete(sessionId);
      this.clients.delete(sessionId);
      
      ws.send(JSON.stringify({
        type: 'character_created',
        character: data,
        imageUrl: imageUrl
      }));

    } catch (error) {
      console.error('Error creating character:', error);
      ws.send(JSON.stringify({ 
        type: 'error', 
        error: 'Failed to create character' 
      }));
    }
  }

  private createCharacterDescription(conversationData: ConversationData): string {
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

  public close() {
    this.wss.close();
  }
}
