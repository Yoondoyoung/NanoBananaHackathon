import { useState, useEffect, useRef } from 'react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface ConversationData {
  name?: string;
  age?: string;
  interests?: string[];
  personality?: string;
  favoriteColor?: string;
  dreamJob?: string;
  hobbies?: string[];
}

interface RealtimeVoiceChatProps {
  onCharacterCreated?: (character: any) => void;
  onClose?: () => void;
}

export default function RealtimeVoiceChat({ onCharacterCreated, onClose }: RealtimeVoiceChatProps) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversationData, setConversationData] = useState<ConversationData>({});
  const [showCreateButton, setShowCreateButton] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [realtimeClient] = useState<any>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const recordingTimeoutRef = useRef<number | null>(null);
  const isRecordingRef = useRef(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const sessionStartedRef = useRef(false);
  const componentMountedRef = useRef(false);
  const sessionIdRef = useRef<string | null>(null);
  const initializationRef = useRef(false);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    // Start session when component mounts (only if not already started)
    if (!initializationRef.current) {
      initializationRef.current = true;
      console.log('🚀 Starting new session...');
      startSession();
    }
    
    return () => {
      // Cleanup
      initializationRef.current = false;
      if (ws) {
        ws.close();
      }
      if (realtimeClient) {
        realtimeClient.disconnect();
      }
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(track => track.stop());
      }
      if (recordingTimeoutRef.current) {
        clearTimeout(recordingTimeoutRef.current);
      }
    };
  }, []); // Empty dependency array to prevent multiple calls

  const startSession = async () => {
    try {
      setIsLoading(true);
      
      // Connect to our WebSocket server to get client secret
      const websocket = new WebSocket('ws://localhost:4001');
      setWs(websocket);
      
      websocket.onopen = () => {
        console.log('WebSocket connected');
        setIsConnected(true);
        
        // Generate session ID
        const newSessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        setSessionId(newSessionId);
        
        // Start session
        websocket.send(JSON.stringify({
          type: 'start_session',
          sessionId: newSessionId
        }));
      };
      
      websocket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        handleWebSocketMessage(data, websocket);
      };
      
      websocket.onclose = () => {
        console.log('WebSocket disconnected');
        setIsConnected(false);
      };
      
      websocket.onerror = (error) => {
        console.error('WebSocket error:', error);
        setIsConnected(false);
      };
      
    } catch (error) {
      console.error('Error starting session:', error);
      setIsLoading(false);
    }
  };

  const handleWebSocketMessage = async (data: any, websocket?: WebSocket) => {
    switch (data.type) {
      case 'session_started':
        console.log('Session started:', data.sessionId);
        sessionIdRef.current = data.sessionId;
        setIsLoading(false);
        
        // Connect to OpenAI Realtime API
        await connectToRealtimeAPI();
        
        // Start audio input after session is fully established
        setTimeout(() => {
          startAudioInput(websocket, data.sessionId);
        }, 1000);
        break;
        
      case 'ai_response':
        console.log('AI response:', data.response);
        setIsProcessing(false);
        
        // Add AI response to chat
        const aiMessage: Message = {
          role: 'assistant',
          content: data.response,
          timestamp: new Date()
        };
        setMessages(prev => [...prev, aiMessage]);
        
        // Update conversation data
        if (data.conversationData) {
          setConversationData(data.conversationData);
          
          // Show create button if we have enough information
          if (data.conversationData.name && data.conversationData.age) {
            setShowCreateButton(true);
          }
        }
        
        // Play audio response if available
        if (data.audioData) {
          playAudioBuffer(data.audioData);
        }
        
        // Restart audio input for next user input
        setTimeout(() => {
          startAudioInput();
        }, 1000);
        break;
        
      case 'character_created':
        console.log('Character created:', data.character);
        onCharacterCreated?.(data.character);
        onClose?.();
        break;
        
      case 'error':
        console.error('WebSocket error:', data.error);
        setIsLoading(false);
        break;
    }
  };

  const connectToRealtimeAPI = async () => {
    try {
      console.log('🔗 Connecting to OpenAI Realtime API via backend proxy...');
      
      // For now, we'll use our backend WebSocket server as a proxy
      // The backend will handle the actual Realtime API connection
      console.log('✅ Using backend proxy for Realtime API connection');
      
      // Add initial welcome message
      setMessages([{
        role: 'assistant',
        content: "Hey there, friend! I'm NanoBanana, and I'm so excited to be your adventure buddy! Ready for some amazing fun together? What's your name?",
        timestamp: new Date()
      }]);
      
    } catch (error) {
      console.error('❌ Failed to connect to Realtime API:', error);
    }
  };



  const startAudioInput = async (websocket?: WebSocket | null, currentSessionId?: string | null) => {
    try {
      const activeWs = websocket || ws;
      const activeSessionId = currentSessionId || sessionId;
      
      console.log('🎤 Starting audio input...');
      console.log('🔍 Current state - ws:', !!activeWs, 'sessionId:', activeSessionId);
      console.log('🔍 Debug - websocket param:', !!websocket, 'currentSessionId param:', currentSessionId);
      console.log('🔍 Debug - state ws:', !!ws, 'state sessionId:', sessionId);
      
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          sampleRate: 24000, // OpenAI Realtime API uses 24kHz
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true
        }
      });
      
      mediaStreamRef.current = stream;
      
      // Create audio context
      const audioContext = new AudioContext({ sampleRate: 24000 });
      audioContextRef.current = audioContext;
      
      // Set recording state after audio context is ready
      setIsRecording(true);
      isRecordingRef.current = true;
      
      // Set timeout to stop recording after 5 seconds
      recordingTimeoutRef.current = setTimeout(() => {
        stopAudioInput();
      }, 5000);
      
      const source = audioContext.createMediaStreamSource(stream);
      
      // Use a more modern approach with AudioWorklet if available, fallback to ScriptProcessor
      if (audioContext.audioWorklet) {
        // Modern approach with AudioWorklet (not implemented yet, using fallback)
        const processor = audioContext.createScriptProcessor(4096, 1, 1);
        
        processor.onaudioprocess = (event) => {
          if (!isRecordingRef.current) {
            console.log('🔇 Not recording, skipping audio processing');
            return;
          }
          
          const inputBuffer = event.inputBuffer;
          const inputData = inputBuffer.getChannelData(0);
          
          // Check if there's actual audio data (lower threshold for better detection)
          const maxLevel = Math.max(...inputData.map(sample => Math.abs(sample)));
          const hasAudio = inputData.some(sample => Math.abs(sample) > 0.001);
          
          if (!hasAudio) {
            console.log('🔇 No audio detected, max level:', maxLevel.toFixed(4));
            return;
          }
          
          console.log('🎤 Audio detected! Max level:', maxLevel.toFixed(4));
          
          // Convert float32 to int16 PCM
          const int16Data = new Int16Array(inputData.length);
          for (let i = 0; i < inputData.length; i++) {
            int16Data[i] = Math.max(-32768, Math.min(32767, inputData[i] * 32768));
          }
          
          // Send audio data to backend WebSocket
          if (activeWs && activeSessionId) {
            const audioData = Array.from(int16Data);
            console.log('🎤 Sending audio data:', audioData.length, 'samples, hasAudio:', hasAudio);
            activeWs.send(JSON.stringify({
              type: 'voice_data',
              sessionId: activeSessionId,
              audioData: audioData
            }));
          } else {
            console.log('❌ Cannot send audio: ws=', !!activeWs, 'sessionId=', activeSessionId);
            console.log('🔍 Debug - ws state:', activeWs?.readyState, 'sessionId state:', activeSessionId);
          }
        };
        
        source.connect(processor);
        processor.connect(audioContext.destination);
      } else {
        // Fallback for older browsers
        const processor = audioContext.createScriptProcessor(4096, 1, 1);
        
        processor.onaudioprocess = (event) => {
          if (!isRecordingRef.current) {
            console.log('🔇 Not recording, skipping audio processing');
            return;
          }
          
          const inputBuffer = event.inputBuffer;
          const inputData = inputBuffer.getChannelData(0);
          
          // Check if there's actual audio data (lower threshold for better detection)
          const hasAudio = inputData.some(sample => Math.abs(sample) > 0.001);
          if (!hasAudio) {
            console.log('🔇 No audio detected, skipping');
            return;
          }
          
          // Convert float32 to int16 PCM
          const int16Data = new Int16Array(inputData.length);
          for (let i = 0; i < inputData.length; i++) {
            int16Data[i] = Math.max(-32768, Math.min(32767, inputData[i] * 32768));
          }
          
          // Send audio data to backend WebSocket
          if (activeWs && activeSessionId) {
            const audioData = Array.from(int16Data);
            console.log('🎤 Sending audio data:', audioData.length, 'samples, hasAudio:', hasAudio);
            activeWs.send(JSON.stringify({
              type: 'voice_data',
              sessionId: activeSessionId,
              audioData: audioData
            }));
          } else {
            console.log('❌ Cannot send audio: ws=', !!activeWs, 'sessionId=', activeSessionId);
          }
        };
        
        source.connect(processor);
        processor.connect(audioContext.destination);
      }
      
      console.log('✅ Audio input started');
      
    } catch (error) {
      console.error('❌ Error starting audio input:', error);
    }
  };

  const stopAudioInput = () => {
    console.log('🛑 Stopping audio input...');
    setIsRecording(false);
    isRecordingRef.current = false;
    setIsProcessing(true);
    
    // Clear recording timeout
    if (recordingTimeoutRef.current) {
      clearTimeout(recordingTimeoutRef.current);
      recordingTimeoutRef.current = null;
    }
    
    // Add user message indicating they spoke
    setMessages(prev => [...prev, {
      role: 'user',
      content: '[Voice message]',
      timestamp: new Date()
    }]);
    
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }
    
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    
    console.log('✅ Audio input stopped');
  };

  const playAudioFromBase64 = (base64Audio: string) => {
    try {
      // Convert base64 to ArrayBuffer
      const binaryString = atob(base64Audio);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      
      // Convert to PCM16 and play
      const pcm16Data = new Int16Array(bytes.buffer);
      playAudioBuffer(Array.from(pcm16Data));
    } catch (error) {
      console.error('Error playing base64 audio:', error);
    }
  };

  const playAudioBuffer = (audioData: number[]) => {
    try {
      if (!audioContextRef.current) return;
      
      const audioContext = audioContextRef.current;
      const audioBufferSource = audioContext.createBufferSource();
      
      // Convert int16 PCM to AudioBuffer
      const int16Data = new Int16Array(audioData);
      const float32Data = new Float32Array(int16Data.length);
      for (let i = 0; i < int16Data.length; i++) {
        float32Data[i] = int16Data[i] / 32768;
      }
      
      const buffer = audioContext.createBuffer(1, float32Data.length, audioContext.sampleRate);
      buffer.copyToChannel(float32Data, 0);
      
      audioBufferSource.buffer = buffer;
      audioBufferSource.connect(audioContext.destination);
      audioBufferSource.start();
      
    } catch (error) {
      console.error('Error playing audio buffer:', error);
    }
  };

  const createCharacter = () => {
    if (ws && sessionId) {
      ws.send(JSON.stringify({
        type: 'create_character',
        sessionId
      }));
    }
  };

  return (
    <div className="realtime-voice-chat-overlay">
      <div className="realtime-voice-chat-container">
        {/* Header */}
        <div className="chat-header">
          <h3>Voice Chat with NanoBanana</h3>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        {/* Connection Status */}
        <div className={`connection-status ${isConnected ? 'connected' : 'disconnected'}`}>
          {isConnected ? '🟢 Connected' : '🔴 Disconnected'}
        </div>

        {/* Voice Input Status */}
        <div className="voice-status">
          {isRecording && (
            <div className="recording-indicator">
              🎤 Recording... Speak now!
            </div>
          )}
          {isProcessing && (
            <div className="processing-indicator">
              🤔 Processing your message...
            </div>
          )}
          {!isRecording && !isProcessing && isConnected && (
            <div className="ready-indicator">
              👂 Ready to listen
            </div>
          )}
        </div>

        {/* Messages */}
        <div className="chat-messages">
          {messages.map((message, index) => (
            <div key={index} className={`message ${message.role}`}>
              <div className="message-content">
                {message.content}
              </div>
              <div className="message-time">
                {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="message assistant">
              <div className="message-content">
                <div className="typing-indicator">
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Character Info Summary */}
        {Object.keys(conversationData).length > 0 && (
          <div className="character-info-summary">
            <h4>Character Info:</h4>
            <div className="info-grid">
              {conversationData.name && <div><strong>Name:</strong> {conversationData.name}</div>}
              {conversationData.age && <div><strong>Age:</strong> {conversationData.age}</div>}
              {conversationData.favoriteColor && <div><strong>Favorite Color:</strong> {conversationData.favoriteColor}</div>}
              {conversationData.dreamJob && <div><strong>Dream Job:</strong> {conversationData.dreamJob}</div>}
              {conversationData.interests && conversationData.interests.length > 0 && (
                <div><strong>Interests:</strong> {conversationData.interests.join(', ')}</div>
              )}
            </div>
          </div>
        )}

        {/* Voice Instructions */}
        <div className="voice-instructions">
          <div className="voice-icon">🎤</div>
          <p>Just start talking! NanoBanana will listen and respond naturally.</p>
          <p className="small-text">Speak clearly and wait for responses.</p>
        </div>

        {/* Create Character Button */}
        {showCreateButton && (
          <div className="create-character-section">
            <button 
              onClick={createCharacter}
              disabled={isLoading}
              className="create-character-btn"
            >
              {isLoading ? 'Creating Character...' : 'Create My Character!'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

const styles = `
.realtime-voice-chat-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 20px;
}

.realtime-voice-chat-container {
  background: white;
  border-radius: 16px;
  width: 100%;
  max-width: 600px;
  height: 80vh;
  max-height: 700px;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
}

.chat-header {
  padding: 20px;
  border-bottom: 1px solid #eee;
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border-radius: 16px 16px 0 0;
}

.chat-header h3 {
  margin: 0;
  font-size: 20px;
}

.close-btn {
  background: none;
  border: none;
  color: white;
  font-size: 24px;
  cursor: pointer;
  padding: 0;
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  transition: background 0.2s;
}

.close-btn:hover {
  background: rgba(255, 255, 255, 0.2);
}

.connection-status {
  padding: 8px 20px;
  font-size: 14px;
  font-weight: 500;
  text-align: center;
}

.connection-status.connected {
  background: #d4edda;
  color: #155724;
}

.connection-status.disconnected {
  background: #f8d7da;
  color: #721c24;
}

.voice-status {
  padding: 12px 20px;
  text-align: center;
  border-bottom: 1px solid #eee;
}

.recording-indicator {
  background: #ffebee;
  color: #c62828;
  padding: 8px 16px;
  border-radius: 20px;
  font-weight: 500;
  animation: pulse 1.5s infinite;
}

.processing-indicator {
  background: #fff3e0;
  color: #ef6c00;
  padding: 8px 16px;
  border-radius: 20px;
  font-weight: 500;
}

.ready-indicator {
  background: #e8f5e8;
  color: #2e7d32;
  padding: 8px 16px;
  border-radius: 20px;
  font-weight: 500;
}

@keyframes pulse {
  0% { opacity: 1; }
  50% { opacity: 0.7; }
  100% { opacity: 1; }
}

.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.message {
  display: flex;
  flex-direction: column;
  max-width: 80%;
}

.message.user {
  align-self: flex-end;
}

.message.assistant {
  align-self: flex-start;
}

.message-content {
  padding: 12px 16px;
  border-radius: 18px;
  word-wrap: break-word;
  line-height: 1.4;
}

.message.user .message-content {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border-bottom-right-radius: 4px;
}

.message.assistant .message-content {
  background: #f1f3f4;
  color: #333;
  border-bottom-left-radius: 4px;
}

.message-time {
  font-size: 11px;
  color: #999;
  margin-top: 4px;
  padding: 0 4px;
}

.typing-indicator {
  display: flex;
  gap: 4px;
  align-items: center;
}

.typing-indicator span {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #999;
  animation: typing 1.4s infinite ease-in-out;
}

.typing-indicator span:nth-child(1) { animation-delay: -0.32s; }
.typing-indicator span:nth-child(2) { animation-delay: -0.16s; }

@keyframes typing {
  0%, 80%, 100% { transform: scale(0.8); opacity: 0.5; }
  40% { transform: scale(1); opacity: 1; }
}

.character-info-summary {
  padding: 16px 20px;
  background: #f8f9fa;
  border-top: 1px solid #eee;
}

.character-info-summary h4 {
  margin: 0 0 12px 0;
  color: #333;
  font-size: 16px;
}

.info-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 8px;
  font-size: 14px;
}

.info-grid div {
  color: #666;
}

.voice-instructions {
  padding: 20px;
  text-align: center;
  background: #e3f2fd;
  border-top: 1px solid #eee;
}

.voice-icon {
  font-size: 48px;
  margin-bottom: 12px;
}

.voice-instructions p {
  margin: 8px 0;
  color: #1976d2;
  font-weight: 500;
}

.voice-instructions .small-text {
  font-size: 14px;
  color: #666;
  font-weight: normal;
}

.create-character-section {
  padding: 20px;
  border-top: 1px solid #eee;
  text-align: center;
}

.create-character-btn {
  background: linear-gradient(135deg, #28a745 0%, #20c997 100%);
  color: white;
  border: none;
  border-radius: 24px;
  padding: 16px 32px;
  font-size: 18px;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.2s;
  box-shadow: 0 4px 16px rgba(40, 167, 69, 0.3);
}

.create-character-btn:hover:not(:disabled) {
  transform: scale(1.05);
}

.create-character-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* Mobile responsive */
@media (max-width: 768px) {
  .realtime-voice-chat-overlay {
    padding: 10px;
  }
  
  .realtime-voice-chat-container {
    height: 90vh;
  }
  
  .message {
    max-width: 90%;
  }
  
  .info-grid {
    grid-template-columns: 1fr;
  }
}
`

// Add styles to head
if (typeof document !== 'undefined') {
  const styleSheet = document.createElement("style");
  styleSheet.innerText = styles;
  document.head.appendChild(styleSheet);
}
