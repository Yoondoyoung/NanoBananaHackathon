import React, { useState, useEffect, useRef } from 'react';
import './StorySystem.css';

interface StoryCharacter {
  id: string;
  name: string;
  description: string;
  character_id: string;
  voice_id: string;
  characters: {
    id: string;
    name: string;
    appearance: string;
    image_url: string;
  };
}

interface StoryLocation {
  id: string;
  name: string;
  description: string;
  background_image_url: string;
  map_position: { x: number; y: number };
}

interface StoryChoice {
  id: string;
  choice_text: string;
  next_dialogue_id: string;
  consequence: string;
}

interface StoryDialogue {
  id: string;
  story_character_id: string;
  story_location_id: string;
  dialogue_text: string;
  emotion: string;
  next_dialogue_id: string;
  is_choice: boolean;
  story_characters: StoryCharacter;
  story_locations: StoryLocation;
  choices: StoryChoice[];
}

interface StoryProgress {
  id: string;
  session_id: string;
  current_dialogue_id: string;
  completed_dialogues: string[];
  choices_made: string[];
}

interface StorySystemProps {
  sessionId: string;
  userCharacterImageUrl?: string;
  onStoryComplete?: () => void;
}

const StorySystem: React.FC<StorySystemProps> = ({ 
  sessionId, 
  userCharacterImageUrl,
  onStoryComplete 
}) => {
  const [currentDialogue, setCurrentDialogue] = useState<StoryDialogue | null>(null);
  const [storyProgress, setStoryProgress] = useState<StoryProgress | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioQueueRef = useRef<AudioBuffer[]>([]);
  const isPlayingRef = useRef(false);

  // Initialize audio context
  useEffect(() => {
    if (typeof window !== 'undefined') {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
  }, []);

  // Load story progress and start the story
  useEffect(() => {
    if (sessionId) {
      loadStoryProgress();
    }
  }, [sessionId]);

  const loadStoryProgress = async () => {
    try {
      setIsLoading(true);
      const response = await fetch(`http://localhost:4000/api/story/progress/${sessionId}`);
      
      if (!response.ok) {
        throw new Error('Failed to load story progress');
      }

      const data = await response.json();
      setStoryProgress(data.progress);
      
      // Load the current dialogue
      if (data.progress.current_dialogue_id) {
        await loadDialogue(data.progress.current_dialogue_id);
      }
    } catch (error) {
      console.error('❌ Error loading story progress:', error);
      setError('Failed to load story progress');
    } finally {
      setIsLoading(false);
    }
  };

  const loadDialogue = async (dialogueId: string) => {
    try {
      const response = await fetch(`http://localhost:4000/api/story/dialogue/${dialogueId}`);
      
      if (!response.ok) {
        throw new Error('Failed to load dialogue');
      }

      const data = await response.json();
      setCurrentDialogue(data.dialogue);
      
      // Play TTS for the dialogue
      if (data.dialogue.dialogue_text) {
        await playDialogueTTS(data.dialogue.dialogue_text, data.dialogue.story_characters.voice_id);
      }
    } catch (error) {
      console.error('❌ Error loading dialogue:', error);
      setError('Failed to load dialogue');
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

  const handleChoiceSelect = async (choice: StoryChoice) => {
    try {
      // Update progress
      const updatedProgress = {
        ...storyProgress!,
        current_dialogue_id: choice.next_dialogue_id,
        completed_dialogues: [...storyProgress!.completed_dialogues, currentDialogue!.id],
        choices_made: [...storyProgress!.choices_made, choice.id]
      };

      // Save progress to backend
      await fetch(`http://localhost:4000/api/story/progress/${sessionId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(updatedProgress)
      });

      setStoryProgress(updatedProgress);

      // Load next dialogue
      if (choice.next_dialogue_id) {
        await loadDialogue(choice.next_dialogue_id);
      } else {
        // Story completed
        onStoryComplete?.();
      }
    } catch (error) {
      console.error('❌ Error handling choice:', error);
      setError('Failed to process choice');
    }
  };

  const handleNextDialogue = async () => {
    if (currentDialogue?.next_dialogue_id) {
      await loadDialogue(currentDialogue.next_dialogue_id);
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
          <p>Loading story...</p>
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

  if (!currentDialogue) {
    return (
      <div className="story-system">
        <div className="story-error">
          <p>No dialogue available</p>
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
          backgroundImage: currentDialogue.story_locations.background_image_url 
            ? `url(${currentDialogue.story_locations.background_image_url})`
            : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
        }}
      >
        {/* Character Images */}
        <div className="story-characters">
          {/* Lyra (NPC) */}
          <div className="character-npc">
            <img 
              src={currentDialogue.story_characters.characters.image_url} 
              alt={currentDialogue.story_characters.name}
              className="character-image"
            />
            <div className="character-name">{currentDialogue.story_characters.name}</div>
          </div>

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
              <span className="character-name">{currentDialogue.story_characters.name}</span>
              {isPlaying && <span className="playing-indicator">🔊</span>}
            </div>
            <div className="dialogue-text">
              {currentDialogue.dialogue_text}
            </div>
            
            {/* Choices */}
            {currentDialogue.is_choice && currentDialogue.choices.length > 0 ? (
              <div className="dialogue-choices">
                {currentDialogue.choices.map((choice) => (
                  <button
                    key={choice.id}
                    className="choice-button"
                    onClick={() => handleChoiceSelect(choice)}
                  >
                    {choice.choice_text}
                  </button>
                ))}
              </div>
            ) : (
              <button 
                className="next-button"
                onClick={handleNextDialogue}
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

export default StorySystem;
