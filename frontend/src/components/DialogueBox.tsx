import { useState, useEffect } from 'react'

interface DialogueBoxProps {
  characterName?: string
  dialogue?: string
  isVisible?: boolean
  onNext?: () => void
  onSave?: () => void
  onLoad?: () => void
  onLog?: () => void
  onAuto?: () => void
  onSkip?: () => void
  onSettings?: () => void
  typingSpeed?: number // 타이핑 속도 (ms)
  skipTyping?: boolean // 타이핑 애니메이션 건너뛰기
  enableTTS?: boolean // TTS 활성화 여부
}

export default function DialogueBox({ 
  characterName = "Nano",
  dialogue = "Hey there, friend! I'm Nano, and I'm so excited to be your adventure buddy! Ready for some amazing fun together?",
  isVisible = true,
  onNext,
  onSave,
  onLoad,
  onLog,
  onAuto,
  onSkip,
  onSettings,
  typingSpeed = 30, // 기본 30ms (음성과 비슷한 속도)
  skipTyping = false,
  enableTTS = true // TTS 기본 활성화
}: DialogueBoxProps) {
  const [displayedText, setDisplayedText] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const [isPlayingTTS, setIsPlayingTTS] = useState(false)

  // TTS 재생 함수
  const playTTS = async (text: string) => {
    if (!enableTTS || !text || isPlayingTTS) return;
    
    try {
      setIsPlayingTTS(true);
      const response = await fetch('/api/elevenlabs/tts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text }),
      });

      if (!response.ok) {
        throw new Error('TTS request failed');
      }

      const data = await response.json();
      
      if (!data.success || !data.audio) {
        throw new Error('Invalid TTS response');
      }

      // Base64 오디오 데이터를 Blob으로 변환
      const audioData = atob(data.audio);
      const audioArray = new Uint8Array(audioData.length);
      for (let i = 0; i < audioData.length; i++) {
        audioArray[i] = audioData.charCodeAt(i);
      }
      
      const audioBlob = new Blob([audioArray], { type: 'audio/mpeg' });
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      
      audio.onended = () => {
        setIsPlayingTTS(false);
        URL.revokeObjectURL(audioUrl);
      };
      
      audio.onerror = (e) => {
        console.error('Audio playback error:', e);
        setIsPlayingTTS(false);
        URL.revokeObjectURL(audioUrl);
      };
      
      await audio.play();
    } catch (error) {
      console.error('TTS Error:', error);
      setIsPlayingTTS(false);
    }
  };

  // 타이핑 애니메이션 효과
  useEffect(() => {
    if (!dialogue) {
      setDisplayedText('')
      setIsTyping(false)
      return
    }
    
    if (skipTyping) {
      setDisplayedText(dialogue)
      setIsTyping(false)
      // skipTyping일 때도 TTS 재생
      if (enableTTS) {
        playTTS(dialogue)
      }
      return
    }

    setDisplayedText('')
    setIsTyping(true)

    // 타이핑과 동시에 TTS 재생 시작
    if (enableTTS) {
      playTTS(dialogue)
    }

    let currentIndex = 0
    const timer = setInterval(() => {
      if (currentIndex >= dialogue.length) {
        setIsTyping(false)
        clearInterval(timer)
        return
      }
      setDisplayedText(dialogue.slice(0, currentIndex + 1))
      currentIndex++
    }, typingSpeed)

    return () => clearInterval(timer)
  }, [dialogue, typingSpeed, skipTyping])

  // 대화가 변경될 때마다 타이핑 애니메이션 재시작
  useEffect(() => {
    if (dialogue && !skipTyping) {
      setDisplayedText('')
      setIsTyping(true)
    }
  }, [dialogue, skipTyping])

  if (!isVisible) return null

  return (
    <div className="dialogue-container">
      {/* 캐릭터 이름 박스 - 좌상단 */}
      {characterName && (
        <div className="character-name-box">
          <span className="character-name">{characterName}</span>
        </div>
      )}
      
      {/* 컨트롤 버튼들 - 우상단 */}
      <div className="control-buttons-container">
        <button className="control-btn" onClick={onSave} title="Save">
          💾 Save
        </button>
        <button className="control-btn" onClick={onLoad} title="Load">
          📁 Load
        </button>
      </div>
      
      {/* 대화 박스 */}
      <div className="dialogue-box" onClick={onNext}>
        <div className="dialogue-text">
          {displayedText}
          {isTyping && <span className="typing-cursor">|</span>}
        </div>
        
        {/* 계속하기 표시 - 타이핑이 끝났을 때만 표시 */}
        {!isTyping && (
          <div className="continue-indicator">
            ▼
          </div>
        )}
      </div>
    </div>
  )
}

const styles = `
.dialogue-container {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 100;
  padding: 0 20px 20px 20px;
  height: 220px;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
}

/* 캐릭터 이름 박스 - 좌상단 */
.character-name-box {
  position: absolute;
  top: 20px;
  left: 20px;
  background: rgba(255, 255, 255, 0.95);
  color: #333;
  padding: 12px 20px;
  border-radius: 12px;
  font-weight: 600;
  font-size: 16px;
  display: flex;
  align-items: center;
  gap: 8px;
  backdrop-filter: blur(10px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  border: 1px solid rgba(0, 0, 0, 0.1);
  z-index: 101;
}

.character-name {
  font-size: 18px;
  font-weight: 700;
  color: #2c3e50;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
}

/* 컨트롤 버튼들 - 우상단 */
.control-buttons-container {
  position: absolute;
  top: 20px;
  right: 20px;
  display: flex;
  gap: 8px;
  z-index: 101;
}

.control-btn {
  background: rgba(255, 255, 255, 0.95);
  color: #667eea;
  border: 1px solid rgba(102, 126, 234, 0.3);
  border-radius: 8px;
  padding: 8px 12px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  backdrop-filter: blur(10px);
  white-space: nowrap;
}

.control-btn:hover {
  background: rgba(102, 126, 234, 0.1);
  border-color: rgba(102, 126, 234, 0.5);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.control-btn:active {
  transform: translateY(0);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.dialogue-box {
  background: rgba(255, 255, 255, 0.95);
  border: 2px solid rgba(0, 0, 0, 0.1);
  border-radius: 16px;
  padding: 32px 40px;
  cursor: pointer;
  position: relative;
  backdrop-filter: blur(10px);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
  transition: all 0.2s ease;
  min-height: 120px;
  display: flex;
  align-items: center;
}

.dialogue-box:hover {
  background: rgba(255, 255, 255, 0.98);
  transform: translateY(-2px);
}

.dialogue-text {
  font-size: 20px;
  line-height: 1.7;
  color: #333;
  margin: 0;
  word-break: keep-all;
  flex: 1;
}

.typing-cursor {
  color: #667eea;
  font-weight: bold;
  animation: blink 1s infinite;
}

@keyframes blink {
  0%, 50% {
    opacity: 1;
  }
  51%, 100% {
    opacity: 0;
  }
}

.continue-indicator {
  position: absolute;
  bottom: 12px;
  right: 20px;
  color: #667eea;
  font-size: 14px;
  animation: bounce 1.5s infinite;
}

@keyframes bounce {
  0%, 20%, 50%, 80%, 100% {
    transform: translateY(0);
  }
  40% {
    transform: translateY(-8px);
  }
  60% {
    transform: translateY(-4px);
  }
}

/* iPad 최적화 */
@media (min-width: 768px) and (max-width: 1024px) {
  .dialogue-container {
    padding: 0 40px 40px 40px;
    height: 280px;
  }
  
  .character-name-box {
    top: 30px;
    left: 30px;
    padding: 16px 24px;
    font-size: 18px;
  }
  
  .character-name {
    font-size: 20px;
  }
  
  .control-buttons-container {
    top: 30px;
    right: 30px;
    gap: 10px;
  }
  
  .control-btn {
    font-size: 14px;
    padding: 10px 14px;
  }
  
  .dialogue-box {
    padding: 40px 48px;
    min-height: 140px;
  }
  
  .dialogue-text {
    font-size: 22px;
    line-height: 1.8;
  }
}

/* 세로 모드 */
@media (orientation: portrait) {
  .dialogue-container {
    padding: 0 24px 32px 24px;
    height: 260px;
  }
  
  .character-name-box {
    top: 15px;
    left: 15px;
    padding: 10px 16px;
    font-size: 14px;
  }
  
  .character-name {
    font-size: 16px;
  }
  
  .control-buttons-container {
    top: 15px;
    right: 15px;
    gap: 6px;
  }
  
  .control-btn {
    font-size: 11px;
    padding: 6px 8px;
  }
  
  .dialogue-box {
    min-height: 130px;
  }
}
`

// 스타일을 head에 추가
if (typeof document !== 'undefined') {
  const styleSheet = document.createElement("style")
  styleSheet.innerText = styles
  document.head.appendChild(styleSheet)
}
