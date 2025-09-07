import WebSocket from 'ws';
import { createServer } from 'http';

interface ConversationData {
  messages: Array<{ role: 'user' | 'assistant'; content: string; timestamp: Date }>;
  sessionId?: string;
}

const conversations = new Map<string, ConversationData>();

export function startWebSocketProxy(port: number = 4003) {
  const server = createServer();
  const wss = new WebSocket.Server({ server });

  wss.on('connection', (clientWs, req) => {
    console.log('🔌 Client connected to WebSocket proxy');
    
    let openaiWs: WebSocket | null = null;
    let conversationId: string | null = null;
    let messageCount = 0;

    // Initialize conversation data
    const initConversation = () => {
      conversationId = `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      conversations.set(conversationId, {
        messages: [],
        sessionId: undefined
      });
      console.log(`📝 Initialized conversation: ${conversationId}`);
    };

    initConversation();

    // Connect to OpenAI Realtime API
    const connectToOpenAI = async () => {
      try {
        console.log('🔗 Connecting to OpenAI Realtime API...');
        
        // Generate client secret first
        const response = await fetch('https://api.openai.com/v1/realtime/client_secrets', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            session: {
              type: 'realtime',
              model: 'gpt-4o-realtime-preview'
            }
          })
        });

        if (!response.ok) {
          throw new Error(`Failed to generate client secret: ${response.status}`);
        }

        const data = await response.json();
        const clientSecret = data.value;
        console.log('✅ Client secret generated');

        // Connect to OpenAI WebSocket with client secret
        openaiWs = new WebSocket('wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview', {
          headers: {
            'Authorization': `Bearer ${clientSecret}`
          }
        });

        openaiWs.on('open', () => {
          console.log('✅ Connected to OpenAI Realtime API');
          
          // Send session update
          const sessionUpdate = {
            type: 'session.update',
            session: {
              type: 'realtime',
              model: 'gpt-4o-realtime-preview',
              output_modalities: ['audio'],
              audio: {
                input: {
                  format: {
                    type: 'audio/pcm',
                    rate: 24000
                  },
                  turn_detection: { 
                    type: 'server_vad', 
                    create_response: true,
                    interrupt_response: true
                  }
                },
                output: {
                  format: {
                    type: 'audio/pcm',
                    rate: 24000
                  },
                  voice: 'alloy',
                  speed: 1.0
                }
              },
              instructions: `You are NanoBanana, a friendly character creation assistant for children. Help them create their unique character by asking about their preferences, interests, and personality. Be warm and encouraging. Ask questions like:
              - What's your name?
              - How old are you?
              - What's your favorite color?
              - What do you like to do for fun?
              - What's your dream job?
              - What makes you special?
              
              After gathering enough information (about 8-10 exchanges), let them know you'll create their character!`
            }
          };

          openaiWs!.send(JSON.stringify(sessionUpdate));
          console.log('📤 Session update sent to OpenAI');
        });

        openaiWs.on('message', (data) => {
          try {
            const event = JSON.parse(data.toString());
            console.log('📨 OpenAI event:', event.type);

            // Handle different event types
            switch (event.type) {
              case 'session.created':
                console.log('✅ OpenAI session created');
                if (conversationId) {
                  const conv = conversations.get(conversationId);
                  if (conv) {
                    conv.sessionId = event.session?.id;
                    conversations.set(conversationId, conv);
                  }
                }
                break;

              case 'session.updated':
                console.log('✅ OpenAI session updated');
                // Forward to client
                clientWs.send(JSON.stringify(event));
                break;

              case 'conversation.item.created':
                if (event.item?.role === 'assistant' && event.item?.content) {
                  // For audio-only mode, we'll count audio responses
                  if (conversationId) {
                    const conv = conversations.get(conversationId);
                    if (conv) {
                      // Add a placeholder message for audio responses
                      conv.messages.push({
                        role: 'assistant',
                        content: '[Audio response]',
                        timestamp: new Date()
                      });
                      conversations.set(conversationId, conv);
                      messageCount++;
                      
                      console.log(`🔊 Assistant audio response received`);
                      console.log(`📊 Total messages: ${messageCount}`);
                    }
                  }
                }
                // Forward to client
                clientWs.send(JSON.stringify(event));
                break;

              case 'response.audio.delta':
                console.log('🔊 Audio delta received, size:', event.delta?.length || 0);
                // Forward audio data to client
                clientWs.send(JSON.stringify(event));
                break;

              case 'response.done':
                console.log('✅ OpenAI response completed');
                // Forward to client
                clientWs.send(JSON.stringify(event));
                break;

              case 'error':
                console.error('❌ OpenAI error:', event.error);
                // Forward error to client
                clientWs.send(JSON.stringify(event));
                break;

              default:
                console.log('📡 Unhandled OpenAI event:', event.type);
                // Forward unknown events to client
                clientWs.send(JSON.stringify(event));
            }
          } catch (error) {
            console.error('❌ Error parsing OpenAI message:', error);
          }
        });

        openaiWs.on('error', (error) => {
          console.error('❌ OpenAI WebSocket error:', error);
          clientWs.send(JSON.stringify({
            type: 'error',
            error: { message: 'OpenAI connection error' }
          }));
        });

        openaiWs.on('close', () => {
          console.log('🔌 OpenAI WebSocket closed');
        });

      } catch (error) {
        console.error('❌ Error connecting to OpenAI:', error);
        clientWs.send(JSON.stringify({
          type: 'error',
          error: { message: 'Failed to connect to OpenAI' }
        }));
      }
    };

    // Handle messages from client
    clientWs.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        console.log('📨 Client message:', message.type);

        if (openaiWs && openaiWs.readyState === WebSocket.OPEN) {
          // Forward audio data to OpenAI
          if (message.type === 'input_audio_buffer.append') {
            openaiWs.send(JSON.stringify(message));
          } else {
            // Forward other messages
            openaiWs.send(JSON.stringify(message));
          }
        } else {
          console.log('⚠️ OpenAI WebSocket not ready, queuing message');
        }
      } catch (error) {
        console.error('❌ Error handling client message:', error);
      }
    });

    clientWs.on('close', () => {
      console.log('🔌 Client disconnected');
      if (openaiWs) {
        openaiWs.close();
      }
    });

    clientWs.on('error', (error) => {
      console.error('❌ Client WebSocket error:', error);
    });

    // Start connection to OpenAI
    connectToOpenAI();
  });

  server.listen(port, () => {
    console.log(`🚀 WebSocket proxy server running on port ${port}`);
  });

  return server;
}

// Export function to get conversation data
export function getConversationData(conversationId: string): ConversationData | undefined {
  return conversations.get(conversationId);
}

// Export function to get all conversations
export function getAllConversations(): Map<string, ConversationData> {
  return conversations;
}
