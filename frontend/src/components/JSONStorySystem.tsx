import React, { useState, useEffect, useRef } from 'react';
import { SceneData, GeneratedScene } from '../types/SceneTypes';
import './StorySystem.css';

interface JSONStorySystemProps {
  sessionId: string;
  userCharacterImageUrl?: string;
  onStoryComplete?: () => void;
}

const JSONStorySystem: React.FC<JSONStorySystemProps> = ({ 
  sessionId: _sessionId, 
  userCharacterImageUrl,
  onStoryComplete 
}) => {
  const [currentScene, setCurrentScene] = useState<GeneratedScene | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentSceneId, setCurrentSceneId] = useState('chapter1_scene1_welcome');
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioQueueRef = useRef<AudioBuffer[]>([]);
  const isPlayingRef = useRef(false);

  // Initialize audio context
  useEffect(() => {
    if (typeof window !== 'undefined') {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
  }, []);

  // Load and generate scene
  useEffect(() => {
    if (currentSceneId) {
      loadAndGenerateScene(currentSceneId);
    }
  }, [currentSceneId]);

  const loadAndGenerateScene = async (sceneId: string) => {
    try {
      setIsLoading(true);
      setError(null);

      // Load scene JSON data
      const sceneResponse = await fetch(`/src/data/scenes/${sceneId}.json`);
      if (!sceneResponse.ok) {
        throw new Error(`Failed to load scene data: ${sceneId}`);
      }

      const sceneData: SceneData = await sceneResponse.json();
      console.log('📖 Loaded scene data:', sceneData);

      // Generate scene images
      const generateResponse = await fetch('http://localhost:4000/api/scene/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(sceneData)
      });

      if (!generateResponse.ok) {
        throw new Error('Failed to generate scene');
      }

      const generateData = await generateResponse.json();
      const generatedScene: GeneratedScene = generateData.scene;
      
      console.log('🎬 Generated scene:', generatedScene);
      setCurrentScene(generatedScene);

      // Play TTS for the dialogue
      if (generatedScene.dialogue.text) {
        await playDialogueTTS(generatedScene.dialogue.text, 'EXAVITQu4vr4xnSDxMaL'); // Sarah voice
      }

    } catch (error) {
      console.error('❌ Error loading/generating scene:', error);
      setError('Failed to load scene');
    } finally {
      setIsLoading(false);
    }
  };

  const playDialogueTTS = async (text: string, voiceId: string) => {
    try {
      setIsPlaying(true);
      isPlayingRef.current = true;

      // Use ElevenLabs TTS
      const response = await fetch('http://localhost:4000/api/elevenlabs/tts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          text,
          voice_id: voiceId
        })
      });

      if (!response.ok) {
        throw new Error('TTS generation failed');
      }

      const audioData = await response.json();
      const audioBuffer = Uint8Array.from(atob(audioData.audioData), c => c.charCodeAt(0));
      
      if (audioContextRef.current) {
        const decodedBuffer = await audioContextRef.current.decodeAudioData(audioBuffer.buffer);
        audioQueueRef.current = [decodedBuffer];
        await playAudioQueue();
      }
    } catch (error) {
      console.error('❌ Error playing TTS:', error);
    } finally {
      setIsPlaying(false);
      isPlayingRef.current = false;
    }
  };

  const playAudioQueue = async () => {
    while (audioQueueRef.current.length > 0 && isPlayingRef.current) {
      const audioBuffer = audioQueueRef.current.shift();
      if (!audioBuffer) continue;

      try {
        const audioBufferSource = audioContextRef.current!.createBufferSource();
        audioBufferSource.buffer = audioBuffer;
        audioBufferSource.connect(audioContextRef.current!.destination);
        
        await new Promise<void>((resolve) => {
          audioBufferSource.onended = () => resolve();
          audioBufferSource.start();
        });
      } catch (error) {
        console.error('❌ Error playing audio buffer:', error);
      }
    }
  };

  const handleChoiceSelect = async (choice: any) => {
    try {
      console.log('🎯 Choice selected:', choice);
      
      // Move to next scene
      if (choice.next_scene_id) {
        setCurrentSceneId(choice.next_scene_id);
      } else {
        // Story completed
        onStoryComplete?.();
      }
    } catch (error) {
      console.error('❌ Error handling choice:', error);
      setError('Failed to process choice');
    }
  };

  const handleNextScene = async () => {
    if (currentScene?.next_scene_id) {
      setCurrentSceneId(currentScene.next_scene_id);
    } else {
      // Story completed
      onStoryComplete?.();
    }
  };

  if (isLoading) {
    return (
      <div className="story-system">
        <div className="story-loading">
          <div className="loading-spinner"></div>
          <p>Generating scene...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="story-system">
        <div className="story-error">
          <p>❌ {error}</p>
          <button onClick={() => window.location.reload()}>Retry</button>
        </div>
      </div>
    );
  }

  if (!currentScene) {
    return (
      <div className="story-system">
        <div className="story-error">
          <p>No scene available</p>
        </div>
      </div>
    );
  }

  return (
    <div className="story-system">
      {/* Background */}
      <div 
        className="story-background"
        style={{
          backgroundImage: currentScene.background_image_url 
            ? `url(${currentScene.background_image_url})`
            : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
        }}
      >
        {/* Character Images */}
        <div className="story-characters">
          {/* NPC Characters */}
          {Object.entries(currentScene.character_images).map(([characterName, imageUrl]) => (
            <div key={characterName} className="character-npc">
              <img 
                src={imageUrl} 
                alt={characterName}
                className="character-image"
              />
              <div className="character-name">{characterName}</div>
            </div>
          ))}

          {/* User Character */}
          {userCharacterImageUrl && (
            <div className="character-user">
              <img 
                src={userCharacterImageUrl} 
                alt="Your Character"
                className="character-image"
              />
              <div className="character-name">You</div>
            </div>
          )}
        </div>

        {/* Dialogue Box */}
        <div className="dialogue-container">
          <div className="dialogue-box">
            <div className="dialogue-header">
              <span className="character-name">{currentScene.dialogue.speaker}</span>
              {isPlaying && <span className="playing-indicator">🔊</span>}
            </div>
            <div className="dialogue-text">
              {currentScene.dialogue.text}
            </div>
            
            {/* Choices */}
            {currentScene.choices && currentScene.choices.length > 0 ? (
              <div className="dialogue-choices">
                {currentScene.choices.map((choice, index) => (
                  <button
                    key={index}
                    className="choice-button"
                    onClick={() => handleChoiceSelect(choice)}
                  >
                    {choice.text}
                  </button>
                ))}
              </div>
            ) : (
              <button 
                className="next-button"
                onClick={handleNextScene}
                disabled={isPlaying}
              >
                {isPlaying ? 'Playing...' : 'Next'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default JSONStorySystem;
