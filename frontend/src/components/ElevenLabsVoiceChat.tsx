import React, { useState, useRef, useEffect } from 'react';
import DialogueBox from './DialogueBox';

interface ElevenLabsVoiceChatProps {
  onClose: () => void;
  onCharacterCreated?: (character: any) => void;
}

const ElevenLabsVoiceChat: React.FC<ElevenLabsVoiceChatProps> = ({ onClose, onCharacterCreated }) => {
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string; timestamp: Date }>>([]);
  const [error, setError] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [characterInfo, setCharacterInfo] = useState<any>(null);
  const [generatedCharacter, setGeneratedCharacter] = useState<any>(null);
  const [currentScene, setCurrentScene] = useState<any>(null);
  const [isLoadingScene, setIsLoadingScene] = useState(false);
  const [sceneError, setSceneError] = useState<string | null>(null);
  const [showChoices, setShowChoices] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const sessionIdRef = useRef<string | null>(null);
  const elevenLabsWsRef = useRef<WebSocket | null>(null);

  // Initialize session and start character creation process
  useEffect(() => {
    const initializeSession = async () => {
      try {
        setIsLoading(true);
        
        // Generate unique session ID
        const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        sessionIdRef.current = sessionId;
        
        // Start with character creation message
        const characterCreationMessage = {
          role: 'assistant' as const,
          content: "Hello there, little friend! I'm so excited to meet you! What should I call you? What's your name?",
          timestamp: new Date()
        };
        
        setMessages([characterCreationMessage]);
        await playDialogue(characterCreationMessage.content);
        
      } catch (error) {
        console.error('❌ Error initializing session:', error);
        setError('Failed to initialize session');
      } finally {
        setIsLoading(false);
      }
    };

    initializeSession();
  }, []);

  const playDialogue = async (text: string) => {
    try {
      setIsPlaying(true);
      
      const response = await fetch('/api/elevenlabs/tts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: text,
          voice_id: 'pNInz6obpgDQGcFmaJgB' // Adam voice
        }),
      });

      if (!response.ok) {
        throw new Error('TTS request failed');
      }

      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      
      audio.onended = () => {
        setIsPlaying(false);
        URL.revokeObjectURL(audioUrl);
      };
      
      audio.onerror = () => {
        setIsPlaying(false);
        URL.revokeObjectURL(audioUrl);
      };
      
      await audio.play();
    } catch (error) {
      console.error('❌ Error playing dialogue:', error);
      setIsPlaying(false);
    }
  };

  const startRecording = async () => {
    try {
      if (isRecording || isProcessing) return;
      
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };
      
      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        await processAudioInput(audioBlob);
        stream.getTracks().forEach(track => track.stop());
      };
      
      mediaRecorder.start();
      setIsRecording(true);
    } catch (error) {
      console.error('❌ Error starting recording:', error);
      setError('Failed to start recording');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const processAudioInput = async (audioBlob: Blob) => {
    try {
      setIsProcessing(true);
      
      const formData = new FormData();
      formData.append('audio', audioBlob, 'recording.webm');
      formData.append('session_id', sessionIdRef.current || '');
      
      const response = await fetch('/api/elevenlabs/transcribe', {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) {
        throw new Error('Transcription failed');
      }
      
      const result = await response.json();
      
      if (result.text) {
        await processUserInput(result.text);
      }
    } catch (error) {
      console.error('❌ Error processing audio input:', error);
      setError('Failed to process audio input');
    } finally {
      setIsProcessing(false);
    }
  };

  const processUserInput = async (userMessage: string) => {
    try {
      setIsProcessing(true);
      
      // Add user message to conversation
      const userMsg = {
        role: 'user' as const,
        content: userMessage,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, userMsg]);

      // Get AI response
      const response = await fetch('/api/elevenlabs/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          session_id: sessionIdRef.current,
          message: userMessage,
          messages: [...messages, userMsg]
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to get AI response');
      }

      const result = await response.json();
      
      // Add AI response to conversation
      const aiMsg = {
        role: 'assistant' as const,
        content: result.response,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, aiMsg]);
      
      // Update character info if available
      if (result.characterInfo) {
        setCharacterInfo(result.characterInfo);
      }
      
      // Play AI response
      await playDialogue(result.response);
      
      // Check if character creation is complete
      if (result.response.includes("Let me create your character now!")) {
        await createCharacter(result.characterInfo);
      }
      
    } catch (error) {
      console.error('❌ Error processing user input:', error);
      setError('Failed to process input');
    } finally {
      setIsProcessing(false);
    }
  };

  const createCharacter = async (characterInfoToUse?: any) => {
    const infoToUse = characterInfoToUse || characterInfo;
    if (!infoToUse || !sessionIdRef.current) {
      console.error('❌ Missing character info or session ID');
      return;
    }

    try {
      console.log('🎨 Creating character with info:', infoToUse);
      
      // Add character creation message
      const creationMsg = {
        role: 'assistant' as const,
        content: "Creating your amazing character now! This will just take a moment...",
        timestamp: new Date()
      };
      setMessages(prev => [...prev, creationMsg]);
      await playDialogue(creationMsg.content);
      
      const response = await fetch('/api/generate-character', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          session_id: sessionIdRef.current,
          characterInfo: infoToUse
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to create character: ${response.status}`);
      }

      const result = await response.json();
      console.log('✅ Character created successfully:', result);
      
      setGeneratedCharacter(result.character);
      
      // Add character completion message
      const completionMsg = {
        role: 'assistant' as const,
        content: `Amazing! Your character is ready! Meet ${result.character.info?.name || 'your character'} - a ${result.character.info?.age || 'young'} year old who loves ${result.character.info?.favoriteColor || 'colors'} and dreams of becoming a ${result.character.info?.dreamJob || 'hero'}! Now let's start your magical adventure!`,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, completionMsg]);
      await playDialogue(completionMsg.content);
      
      // Start the story
      setTimeout(() => {
        startStory();
      }, 2000);
      
    } catch (error) {
      console.error('❌ Error creating character:', error);
      setError('Failed to create character');
    }
  };

  const startStory = async () => {
    try {
      setIsLoadingScene(true);
      setSceneError(null);
      
      // Load first scene
      const response = await fetch('/src/data/scenes/chapter1_scene1_welcome.json');
      if (!response.ok) {
        throw new Error('Failed to load scene data');
      }
      
      const sceneData = await response.json();
      
      // Generate scene images
      const sceneResponse = await fetch('/api/scene/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(sceneData),
      });
      
      if (!sceneResponse.ok) {
        throw new Error('Failed to generate scene');
      }
      
      const generatedScene = await sceneResponse.json();
      setCurrentScene(generatedScene.scene);
      
      // Add story dialogue to messages
      if (generatedScene.scene.dialogue?.text) {
        const storyMessage = {
          role: 'assistant' as const,
          content: generatedScene.scene.dialogue.text,
          timestamp: new Date()
        };
        setMessages(prev => [...prev, storyMessage]);
        
        // Play dialogue using TTS
        await playDialogue(generatedScene.scene.dialogue.text);
      }
      
    } catch (error) {
      console.error('❌ Error starting story:', error);
      setSceneError('Failed to start story');
    } finally {
      setIsLoadingScene(false);
    }
  };

  const loadNextScene = async (sceneId: string) => {
    try {
      setIsLoadingScene(true);
      
      const response = await fetch(`/src/data/scenes/${sceneId}.json`);
      if (!response.ok) {
        throw new Error('Failed to load scene data');
      }
      
      const sceneData = await response.json();
      
      // Generate scene images
      const sceneResponse = await fetch('/api/scene/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(sceneData),
      });
      
      if (!sceneResponse.ok) {
        throw new Error('Failed to generate scene');
      }
      
      const generatedScene = await sceneResponse.json();
      setCurrentScene(generatedScene.scene);
      
      // Add story dialogue to messages
      if (generatedScene.scene.dialogue?.text) {
        const storyMessage = {
          role: 'assistant' as const,
          content: generatedScene.scene.dialogue.text,
          timestamp: new Date()
        };
        setMessages(prev => [...prev, storyMessage]);
        
        // Play dialogue using TTS
        await playDialogue(generatedScene.scene.dialogue.text);
      }
      
    } catch (error) {
      console.error('❌ Error loading next scene:', error);
    } finally {
      setIsLoadingScene(false);
    }
  };

  const handleChoiceSelection = async (choice: any) => {
    try {
      setShowChoices(false);
      
      // Add user choice to messages
      const choiceMsg = {
        role: 'user' as const,
        content: choice.text,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, choiceMsg]);
      
      // Load next scene if available
      if (choice.next_scene_id) {
        await loadNextScene(choice.next_scene_id);
      }
    } catch (error) {
      console.error('❌ Error handling choice:', error);
    }
  };

  // Show story view with integrated dialogue
  if (currentScene) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 z-50">
        {/* Background Image */}
        <div className="absolute inset-0 flex items-center justify-center">
          {currentScene.background_image_url ? (
            <img 
              src={currentScene.background_image_url} 
              alt="Scene Background" 
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="text-gray-500 text-2xl">Loading background...</div>
          )}
        </div>
        
        
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-white text-2xl bg-black bg-opacity-50 rounded-full w-10 h-10 flex items-center justify-center hover:bg-opacity-70 transition-all"
        >
          ✕
        </button>
        
        {/* Dialogue Box */}
        <DialogueBox
          characterName={currentScene.dialogue?.speaker}
          dialogue={currentScene.dialogue?.text}
          isVisible={true}
          onNext={() => {
            // Auto advance to next scene or show choices
            if (currentScene.choices && currentScene.choices.length > 0) {
              // Show choices overlay
              setShowChoices(true);
            } else if (currentScene.next_scene_id) {
              // Load next scene
              loadNextScene(currentScene.next_scene_id);
            }
          }}
        />
        
        {/* Choices Overlay */}
        {showChoices && currentScene.choices && currentScene.choices.length > 0 && (
          <div className="absolute bottom-32 left-1/2 transform -translate-x-1/2 w-full max-w-2xl px-4">
            <div className="bg-white bg-opacity-95 rounded-lg p-4 space-y-3">
              <h3 className="text-lg font-semibold text-gray-800 mb-3">Choose your response:</h3>
              {currentScene.choices.map((choice: any, index: number) => (
                <button
                  key={index}
                  onClick={() => handleChoiceSelection(choice)}
                  className="w-full p-4 text-left bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors text-gray-800"
                >
                  {choice.text}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // Show main dialogue interface with DialogueBox
  // Only show AI responses in DialogueBox, not user inputs
  const currentMessage = messages.filter(msg => msg.role === 'assistant').slice(-1)[0];
  
  return (
    <div className="absolute inset-0 z-10">
      {/* Close Button */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 text-white text-2xl bg-black bg-opacity-50 rounded-full w-10 h-10 flex items-center justify-center hover:bg-opacity-70 transition-all z-10"
      >
        ✕
      </button>
      
      {/* Test Button - Start Story */}
      <button
        onClick={startStory}
        className="absolute top-4 left-4 text-white text-sm bg-blue-600 bg-opacity-80 px-4 py-2 rounded-lg hover:bg-opacity-100 transition-all z-10"
      >
        🎬 Start Story
      </button>
      
      {/* DialogueBox */}
      <DialogueBox
        characterName={
          currentScene?.dialogue?.speaker || 
          (currentMessage?.role === 'assistant' ? 'Nano' : 'You')
        }
        dialogue={currentMessage?.content || "Hello there, little friend! I'm so excited to meet you! What should I call you? What's your name?"}
        isVisible={true}
        typingSpeed={20} // 음성과 동기화된 타이핑 속도 (20ms)
        enableTTS={false} // TTS는 playDialogue 함수에서 처리
        onNext={() => {
          // Handle dialogue progression
          if (isProcessing) return;
          
          // No action needed - user input is handled via voice recording
        }}
      />
      
      {/* Voice Recording UI - Just the microphone icon */}
      <div style={{
        position: 'absolute',
        bottom: '20%',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 200
      }}>
        {isProcessing ? (
          <div style={{
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            backgroundColor: 'rgba(59, 130, 246, 0.9)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)'
          }}>
            <div style={{
              width: '24px',
              height: '24px',
              border: '2px solid #ffffff',
              borderTop: '2px solid transparent',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite'
            }}></div>
          </div>
        ) : (
          <button
            onMouseDown={startRecording}
            onMouseUp={stopRecording}
            onTouchStart={startRecording}
            onTouchEnd={stopRecording}
            onKeyDown={(e) => {
              if (e.key === ' ') {
                e.preventDefault();
                startRecording();
              }
            }}
            onKeyUp={(e) => {
              if (e.key === ' ') {
                e.preventDefault();
                stopRecording();
              }
            }}
            style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              border: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '28px',
              color: 'white',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              backgroundColor: isRecording ? '#ef4444' : '#3b82f6',
              transform: isRecording ? 'scale(1.1)' : 'scale(1)',
              boxShadow: isRecording ? '0 4px 12px rgba(0, 0, 0, 0.4)' : '0 2px 8px rgba(0, 0, 0, 0.3)'
            }}
            disabled={isProcessing}
          >
            {isRecording ? '⏹️' : '🎤'}
          </button>
        )}
      </div>
      
      {error && (
        <div className="absolute bottom-20 left-1/2 transform -translate-x-1/2">
          <div className="bg-red-100 border border-red-400 text-red-700 rounded-lg p-3">
            {error}
          </div>
        </div>
      )}
      
    </div>
  );
};

export default ElevenLabsVoiceChat;
