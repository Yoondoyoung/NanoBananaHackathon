import { WebSocketServer, WebSocket } from 'ws';
import { RealtimeAgent, RealtimeSession } from '@openai/agents/realtime';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai';
import fs from 'fs';
import path from 'path';

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
  realtimeSession?: RealtimeSession;
}

// Store conversation sessions
const conversationSessions = new Map<string, ConversationData>();

export class AgentsServer {
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
            // Clean up Realtime session
            const conversationData = conversationSessions.get(sessionId);
            if (conversationData?.realtimeSession) {
              conversationData.realtimeSession.disconnect();
            }
            conversationSessions.delete(sessionId);
            break;
          }
        }
      });

      ws.on('error', (error) => {
        console.error('WebSocket error:', error);
      });
    });

    console.log(`Agents WebSocket server running on port ${this.wss.options.port}`);
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

      // Create Realtime Agent
      const agent = new RealtimeAgent({
        name: "NanoBanana",
        instructions: "You are NanoBanana, a friendly character creation assistant for children. Help them create their unique character by asking about their preferences, interests, and personality. Be warm, encouraging, and playful. Ask questions like 'What's your name?', 'How old are you?', 'What do you like to do for fun?', 'What's your favorite color?', 'What do you want to be when you grow up?'. Keep the conversation light and fun!",
      });

      // Create Realtime Session
      const realtimeSession = new RealtimeSession(agent);
      conversationData.realtimeSession = realtimeSession;

      // Set up event listeners
      realtimeSession.on('conversation.item.created', (event) => {
        if (event.item.type === 'message') {
          const message = {
            role: event.item.role as 'user' | 'assistant',
            content: event.item.content?.[0]?.text || '',
            timestamp: new Date()
          };
          
          // Update conversation data
          conversationData.messages.push(message);
          
          // Send response to client
          ws.send(JSON.stringify({
            type: 'ai_response',
            response: message.content,
            role: message.role,
            conversationData: this.extractCharacterInfo(conversationData)
          }));

          // 대화가 충분히 진행되었으면 자동으로 캐릭터 생성
          if (conversationData.messages.length >= 10) {
            console.log('🎨 Auto-creating character after sufficient conversation');
            setTimeout(() => {
              this.createCharacter(ws, sessionId);
            }, 2000);
          }
        }
      });

      // Connect to Realtime API
      await realtimeSession.connect({
        apiKey: process.env.OPENAI_API_KEY!
      });

      // Send session info to client
      ws.send(JSON.stringify({
        type: 'session_started',
        sessionId,
        message: 'Session started successfully with Agents SDK'
      }));

      console.log(`✅ Session started with Agents SDK: ${sessionId}`);
    } catch (error) {
      console.error('Error starting session:', error);
      ws.send(JSON.stringify({ 
        type: 'error', 
        error: 'Failed to start session' 
      }));
    }
  }

  private async handleVoiceData(ws: WebSocket, sessionId: string, audioData: number[]) {
    try {
      console.log('🎤 handleVoiceData called with sessionId:', sessionId, 'audioData length:', audioData.length);
      
      const conversationData = conversationSessions.get(sessionId);
      if (!conversationData || !conversationData.realtimeSession) {
        console.log('❌ Session not found or no Realtime session:', sessionId);
        ws.send(JSON.stringify({ 
          type: 'error', 
          error: 'Session not found' 
        }));
        return;
      }

      console.log('🎤 Received voice data, length:', audioData.length);
      
      // Convert audio data to the format expected by Agents SDK
      const audioBuffer = Buffer.from(new Int16Array(audioData).buffer);
      
      // Send audio to Realtime session
      // Check if sendAudio method exists
      if (typeof conversationData.realtimeSession.sendAudio === 'function') {
        try {
          // Try sending as Buffer first
          await conversationData.realtimeSession.sendAudio(audioBuffer);
        } catch (error) {
          console.log('🔄 Trying base64 format...');
          // If Buffer doesn't work, try base64
          const base64Audio = audioBuffer.toString('base64');
          await conversationData.realtimeSession.sendAudio(base64Audio);
        }
      } else {
        console.log('❌ sendAudio method not found on RealtimeSession');
        console.log('Available methods:', Object.getOwnPropertyNames(conversationData.realtimeSession));
        
        // Try alternative method - maybe it's called differently
        if (typeof conversationData.realtimeSession.send === 'function') {
          await conversationData.realtimeSession.send({
            type: 'input_audio_buffer.append',
            audio: audioBuffer.toString('base64')
          });
        } else {
          console.log('❌ No suitable audio sending method found');
        }
      }

    } catch (error) {
      console.error('❌ Error handling voice data:', error);
      ws.send(JSON.stringify({ 
        type: 'error', 
        error: 'Failed to process voice data' 
      }));
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
      if (conversationData.realtimeSession) {
        await conversationData.realtimeSession.disconnect();
      }
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
