import { useState, useEffect, useRef } from 'react';

interface SimpleVoiceChatProps {
  onClose: () => void;
  onCharacterCreated?: (character: any) => void;
}

export default function SimpleVoiceChat({ onClose, onCharacterCreated }: SimpleVoiceChatProps) {
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string; timestamp: Date }>>([]);
  const [error, setError] = useState<string | null>(null);
  const [conversationData] = useState<any>(null);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  
  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const messageCountRef = useRef(0);
  const hasInitialized = useRef(false);
  const isRecordingRef = useRef(false);

  useEffect(() => {
    if (hasInitialized.current) {
      return;
    }
    hasInitialized.current = true;
    
    // Add small delay to prevent duplicate initialization
    const timer = setTimeout(() => {
      initializeVoiceChat();
    }, 100);
    
    return () => {
      clearTimeout(timer);
      cleanup();
    };
  }, []);

  const cleanup = () => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }
    hasInitialized.current = false;
  };

  const initializeVoiceChat = async () => {
    try {
      setIsLoading(true);
      setError(null);
      console.log('🚀 Starting WebSocket voice chat initialization...');

      // Connect to backend WebSocket proxy
      console.log('🔗 Connecting to backend WebSocket proxy...');
      const ws = new WebSocket('ws://localhost:4003');

      wsRef.current = ws;

      ws.onopen = () => {
        console.log('✅ Connected to backend WebSocket proxy');
        console.log('⏳ Waiting for OpenAI connection...');
      };

      ws.onmessage = (event) => {
        handleServerEvent(JSON.parse(event.data));
      };

      ws.onerror = (error) => {
        console.error('❌ WebSocket error:', error);
        setError('WebSocket connection error');
        setIsLoading(false);
      };

      ws.onclose = () => {
        console.log('🔌 WebSocket closed');
        setIsConnected(false);
      };

      // 3. Set up audio input
      await setupAudioInput();

    } catch (error: any) {
      console.error('❌ Error initializing voice chat:', error);
      setError(`Failed to initialize voice chat: ${error.message}`);
      setIsLoading(false);
    }
  };

  const setupAudioInput = async () => {
    try {
      console.log('🎤 Setting up audio input...');
      
      // Get microphone access
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          sampleRate: 24000,
          channelCount: 1
        }
      });
      
      mediaStreamRef.current = stream;
      console.log('✅ Microphone access granted');

      // Create audio context
      const audioContext = new AudioContext({ sampleRate: 24000 });
      audioContextRef.current = audioContext;
      
      // Resume audio context if suspended (required for user interaction)
      if (audioContext.state === 'suspended') {
        await audioContext.resume();
        console.log('🔊 Audio context resumed');
      }
      
      console.log('🎵 Audio context created, state:', audioContext.state);

      // Create audio source and processor
      const source = audioContext.createMediaStreamSource(stream);
      
      // Use ScriptProcessorNode for now (AudioWorkletNode requires separate file)
      const processor = audioContext.createScriptProcessor(4096, 1, 1);

      processor.onaudioprocess = (audioEvent) => {
        if (!isRecordingRef.current || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
          return;
        }

        const inputData = audioEvent.inputBuffer.getChannelData(0);
        
        // Check if there's actual audio data
        const hasAudio = inputData.some(sample => Math.abs(sample) > 0.001);
        if (!hasAudio) {
          return;
        }

        // Convert float32 to int16 PCM
        const int16Data = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          int16Data[i] = Math.max(-32768, Math.min(32767, inputData[i] * 32768));
        }

        // Convert to base64
        const base64Audio = btoa(String.fromCharCode(...new Uint8Array(int16Data.buffer)));

        // Send audio data
        const audioMessage = {
          type: 'input_audio_buffer.append',
          audio: base64Audio
        };

        wsRef.current.send(JSON.stringify(audioMessage));
      };

      source.connect(processor);
      processor.connect(audioContext.destination);

      // Start recording
      isRecordingRef.current = true;
      console.log('🎤 Audio input started');

    } catch (error) {
      console.error('❌ Error setting up audio input:', error);
      setError('Failed to access microphone');
      setIsLoading(false);
    }
  };


  const handleServerEvent = (event: any) => {
    console.log('📨 Server event received:', event);

    switch (event.type) {
      case 'session.created':
        console.log('✅ Session created');
        break;
        
      case 'session.updated':
        console.log('✅ Session updated');
        setIsConnected(true);
        setIsLoading(false);
        break;
        
      case 'conversation.item.created':
        if (event.item.role === 'assistant' && event.item.content) {
          const textContent = event.item.content.find((c: any) => c.type === 'text')?.text;
          if (textContent) {
            const newMessage = {
              role: 'assistant' as const,
              content: textContent,
              timestamp: new Date()
            };
            
            setMessages(prev => [...prev, newMessage]);
            messageCountRef.current++;
            
            console.log(`💬 Total messages: ${messageCountRef.current}`);
            
            // Check if we have enough conversation to create character
            if (messageCountRef.current >= 8) {
              console.log('🎨 Enough conversation, creating character...');
              setTimeout(() => {
                createCharacter();
              }, 2000);
            }
          }
        }
        break;
        
      case 'response.audio.delta':
        // Handle audio output
        console.log('🔊 Audio delta received, size:', event.delta?.length || 0);
        if (event.delta) {
          playAudioChunk(event.delta);
        }
        break;
        
      case 'response.done':
        console.log('✅ Response completed');
        setIsSpeaking(false);
        break;
        
      case 'input_audio_buffer.speech_started':
        console.log('🎤 Speech started');
        setIsListening(true);
        break;
        
      case 'input_audio_buffer.speech_stopped':
        console.log('🔇 Speech stopped');
        setIsListening(false);
        break;
        
      case 'input_audio_buffer.committed':
        console.log('✅ Audio committed');
        break;
        
      case 'conversation.item.added':
        console.log('💬 Conversation item added');
        if (event.item?.role === 'user') {
          const newMessage = {
            role: 'user' as const,
            content: '[Voice message]',
            timestamp: new Date()
          };
          setMessages(prev => [...prev, newMessage]);
        }
        break;
        
      case 'conversation.item.done':
        console.log('✅ Conversation item done');
        break;
        
      case 'response.created':
        console.log('🔊 Response created');
        setIsSpeaking(true);
        break;
        
      case 'error':
        console.error('❌ Server error:', event);
        console.error('❌ Error details:', event.error);
        console.error('❌ Error type:', event.error?.type);
        console.error('❌ Error message:', event.error?.message);
        console.error('❌ Error code:', event.error?.code);
        setError(`Server error: ${event.error?.message || event.error?.type || 'Unknown error'}`);
        break;
        
      default:
        console.log('📡 Unhandled event:', event.type);
    }
  };

  const playAudioChunk = (base64Audio: string) => {
    try {
      console.log('🎵 Playing audio chunk, size:', base64Audio.length);
      
      if (!audioContextRef.current) {
        console.error('❌ AudioContext not available');
        return;
      }

      // Convert base64 to audio buffer
      const binaryString = atob(base64Audio);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      console.log('🔊 Converted to bytes, length:', bytes.length);

      // Convert to audio buffer and play
      const audioBuffer = audioContextRef.current.createBuffer(1, bytes.length / 2, 24000);
      const channelData = audioBuffer.getChannelData(0);
      
      // Convert int16 to float32
      const int16Data = new Int16Array(bytes.buffer);
      for (let i = 0; i < int16Data.length; i++) {
        channelData[i] = int16Data[i] / 32768;
      }

      console.log('🎵 Audio buffer created, samples:', channelData.length);

      // Play audio
      const source = audioContextRef.current.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContextRef.current.destination);
      source.start();
      
      console.log('🔊 Audio playback started');
    } catch (error) {
      console.error('❌ Error playing audio:', error);
    }
  };

  const createCharacter = async () => {
    try {
      console.log('🎨 Creating character from conversation...');
      
      // Create character description from conversation
      const userMessages = messages.filter(msg => msg.role === 'user');
      
      let description = 'A young, friendly character';
      if (userMessages.length > 0) {
        description += ' who is adventurous and creative';
      }
      description += '. The character should look approachable and ready for fun.';
      
      // Send character creation request to backend
      const response = await fetch('http://localhost:4000/api/create-character', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          conversationData: conversationData,
          messages: messages,
          description: description
        })
      });

      if (!response.ok) {
        throw new Error('Failed to create character');
      }

      const { character } = await response.json();
      
      if (onCharacterCreated) {
        onCharacterCreated(character);
      }

      // Add success message
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: '🎉 Your character has been created! Check it out!',
        timestamp: new Date()
      }]);

      // Auto-close after 3 seconds
      setTimeout(() => {
        onClose();
      }, 3000);

    } catch (error) {
      console.error('❌ Error creating character:', error);
      setError('Failed to create character');
    }
  };

  const handleDisconnect = () => {
    cleanup();
    onClose();
  };

  return (
    <div className="simple-voice-chat-modal">
      <div className="voice-chat-container">
        <div className="voice-chat-header">
          <h2>🎤 Voice Chat with NanoBanana</h2>
          <button className="close-button" onClick={handleDisconnect}>
            ✕
          </button>
        </div>

        <div className="voice-chat-content">
          {isLoading && (
            <div className="loading-state">
              <div className="loading-spinner"></div>
              <p>Connecting to NanoBanana...</p>
            </div>
          )}

          {error && (
            <div className="error-state">
              <p>❌ {error}</p>
              <button onClick={initializeVoiceChat}>Retry</button>
            </div>
          )}

          {isConnected && !error && (
            <div className="connected-state">
              <div className="status-indicator">
                <div className="status-dot connected"></div>
                <span>Connected - Start talking!</span>
              </div>
              
              {audioContextRef.current?.state === 'suspended' && (
                <div className="audio-activation">
                  <button 
                    className="activate-audio-btn"
                    onClick={async () => {
                      if (audioContextRef.current) {
                        await audioContextRef.current.resume();
                        console.log('🔊 Audio context activated by user');
                      }
                    }}
                  >
                    🔊 Click to Enable Audio
                  </button>
                </div>
              )}
              
              <div className="messages-container">
                {messages.map((message, index) => (
                  <div key={index} className={`message ${message.role}`}>
                    <div className="message-content">
                      {message.content}
                    </div>
                    <div className="message-time">
                      {message.timestamp.toLocaleTimeString()}
                    </div>
                  </div>
                ))}
              </div>

              <div className="voice-instructions">
                <p>🎤 Speak naturally - NanoBanana will respond!</p>
                <p>Answer questions about yourself to create your character</p>
                
                <div className="voice-status">
                  <div className={`status-indicator ${isListening ? 'listening' : ''}`}>
                    <div className={`status-dot ${isListening ? 'listening' : 'connected'}`}></div>
                    <span>
                      {isListening ? '🎤 Listening...' : 
                       isSpeaking ? '🔊 NanoBanana is speaking...' : 
                       '✅ Ready to listen - try speaking!'}
                    </span>
                  </div>
                </div>
                
                <div className="connection-status">
                  <div className="status-indicator">
                    <div className="status-dot connected"></div>
                    <span>WebSocket voice chat is active</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <style>{`
        .simple-voice-chat-modal {
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
        }

        .voice-chat-container {
          background: white;
          border-radius: 20px;
          width: 90%;
          max-width: 600px;
          max-height: 80vh;
          display: flex;
          flex-direction: column;
          box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
        }

        .voice-chat-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 20px;
          border-bottom: 1px solid #eee;
        }

        .voice-chat-header h2 {
          margin: 0;
          color: #333;
          font-size: 1.5rem;
        }

        .close-button {
          background: #ff4757;
          color: white;
          border: none;
          border-radius: 50%;
          width: 40px;
          height: 40px;
          font-size: 1.2rem;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .voice-chat-content {
          flex: 1;
          padding: 20px;
          overflow-y: auto;
        }

        .loading-state {
          text-align: center;
          padding: 40px;
        }

        .loading-spinner {
          width: 40px;
          height: 40px;
          border: 4px solid #f3f3f3;
          border-top: 4px solid #3498db;
          border-radius: 50%;
          animation: spin 1s linear infinite;
          margin: 0 auto 20px;
        }

        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }

        .error-state {
          text-align: center;
          padding: 40px;
          color: #e74c3c;
        }

        .error-state button {
          background: #3498db;
          color: white;
          border: none;
          padding: 10px 20px;
          border-radius: 5px;
          cursor: pointer;
          margin-top: 10px;
        }

        .connected-state {
          height: 100%;
          display: flex;
          flex-direction: column;
        }

        .status-indicator {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 20px;
          padding: 10px;
          background: #f8f9fa;
          border-radius: 10px;
        }

        .status-dot {
          width: 12px;
          height: 12px;
          border-radius: 50%;
        }

        .status-dot.connected {
          background: #27ae60;
          animation: pulse 2s infinite;
        }

        .status-dot.listening {
          background: #e74c3c;
          animation: listening 0.5s infinite;
        }

        .status-indicator.listening {
          background: #ffe6e6;
          border: 1px solid #e74c3c;
        }

        @keyframes pulse {
          0% { opacity: 1; }
          50% { opacity: 0.5; }
          100% { opacity: 1; }
        }

        @keyframes listening {
          0% { transform: scale(1); }
          50% { transform: scale(1.2); }
          100% { transform: scale(1); }
        }

        .messages-container {
          flex: 1;
          max-height: 300px;
          overflow-y: auto;
          margin-bottom: 20px;
          padding: 10px;
          background: #f8f9fa;
          border-radius: 10px;
        }

        .message {
          margin-bottom: 15px;
        }

        .message.user {
          text-align: right;
        }

        .message.assistant {
          text-align: left;
        }

        .message-content {
          display: inline-block;
          max-width: 80%;
          padding: 10px 15px;
          border-radius: 15px;
          font-size: 0.9rem;
          line-height: 1.4;
        }

        .message.user .message-content {
          background: #3498db;
          color: white;
        }

        .message.assistant .message-content {
          background: white;
          color: #333;
          border: 1px solid #ddd;
        }

        .message-time {
          font-size: 0.7rem;
          color: #666;
          margin-top: 5px;
        }

        .voice-instructions {
          text-align: center;
          padding: 15px;
          background: #e8f5e8;
          border-radius: 10px;
          color: #2d5a2d;
        }

        .voice-instructions p {
          margin: 5px 0;
          font-size: 0.9rem;
        }

        .connection-status {
          margin-top: 10px;
        }

        .audio-activation {
          text-align: center;
          margin: 20px 0;
          padding: 15px;
          background: #fff3cd;
          border: 1px solid #ffeaa7;
          border-radius: 10px;
        }

        .activate-audio-btn {
          background: #f39c12;
          color: white;
          border: none;
          padding: 12px 24px;
          border-radius: 8px;
          font-size: 1rem;
          cursor: pointer;
          transition: background 0.3s;
        }

        .activate-audio-btn:hover {
          background: #e67e22;
        }
      `}</style>
    </div>
  );
}