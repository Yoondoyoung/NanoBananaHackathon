import { useState, useEffect, useRef } from 'react'
import VisualNovelLayout from './components/VisualNovelLayout'
import DialogueBox from './components/DialogueBox'
import UIOverlay from './components/UIOverlay'
import ElevenLabsVoiceChat from './components/ElevenLabsVoiceChat'
import TitleScreen from './components/TitleScreen'

function App() {
  const [serverConnected, setServerConnected] = useState(false)
  const [loading, setLoading] = useState(true)
  const [characterData, setCharacterData] = useState<any>(null)
  const [defaultCharacter, setDefaultCharacter] = useState<any>(null)
  const [welcomeSceneImage, setWelcomeSceneImage] = useState<string | null>(null)
  const [currentDialogue, setCurrentDialogue] = useState({
    character: "",
    text: ""
  })
  const [isPlayingNarration, setIsPlayingNarration] = useState(false)
  const [hasPlayedWelcomeNarration, setHasPlayedWelcomeNarration] = useState(false)
  const [userHasInteracted, setUserHasInteracted] = useState(false)
  const [showAutoVoiceChat, setShowAutoVoiceChat] = useState(false)
  const [createdCharacter, setCreatedCharacter] = useState<any>(null)
  const [showTitleScreen, setShowTitleScreen] = useState(true)
  const hasInitialized = useRef(false)
  const autoVoiceChatStarted = useRef(false)

  useEffect(() => {
    // 중복 실행 방지
    if (hasInitialized.current) {
      return
    }
    hasInitialized.current = true

    // 서버 연결 테스트 및 기본 캐릭터 로드 (Start Game 버튼을 누르기 전까지는 기본 데이터만 로드)
    Promise.all([
      fetch('/api/test').then(res => res.ok ? res.json() : { status: 'error' }).catch(() => ({ status: 'error' })),
      fetch('/api/default-character').then(res => res.ok ? res.json() : { character: null }).catch(() => ({ character: null }))
    ])
      .then(([serverData, characterData]) => {
        console.log('서버 연결 결과:', serverData)
        console.log('기본 캐릭터 로드 결과:', characterData)
        
        if (serverData.status === 'success') {
          setServerConnected(true)
        } else {
          setServerConnected(false)
        }
        
        if (characterData.character) {
          setDefaultCharacter(characterData.character)
        } else {
          // 서버 연결 실패 시 기본값 설정
          setDefaultCharacter({ name: 'Nano', appearance: 'a friendly guild receptionist' })
        }
        
        setLoading(false)
        
        // 타이틀 스크린 진입 시 환영 장면 미리 생성
        generateWelcomeScene()
      })
      .catch(err => {
        console.error('서버 연결 또는 캐릭터 로드 실패:', err)
        setServerConnected(false)
        // 에러 발생 시에도 기본값으로 화면 표시
        setDefaultCharacter({ name: 'Nano', appearance: 'a friendly guild receptionist' })
        setLoading(false)
        
        // 에러 발생 시에도 환영 장면 미리 생성
        generateWelcomeScene()
      })
  }, [])

  // 사용자 상호작용 감지를 위한 이벤트 리스너 추가 (타이틀 화면이 아닐 때만)
  useEffect(() => {
    const handleClick = () => handleUserInteraction()
    const handleTouch = () => handleUserInteraction()
    const handleKeyDown = () => handleUserInteraction()

    // 타이틀 화면이 아니고 사용자가 아직 상호작용하지 않았다면 이벤트 리스너 추가
    if (!showTitleScreen && !userHasInteracted) {
      document.addEventListener('click', handleClick)
      document.addEventListener('touchstart', handleTouch)
      document.addEventListener('keydown', handleKeyDown)
    }

    return () => {
      document.removeEventListener('click', handleClick)
      document.removeEventListener('touchstart', handleTouch)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [userHasInteracted, showTitleScreen])

  // 나레이션 완료 후 자동으로 음성 대화 시작 (타이틀 화면이 아닐 때만)
  useEffect(() => {
    if (!showTitleScreen && hasPlayedWelcomeNarration && !isPlayingNarration && !autoVoiceChatStarted.current) {
      autoVoiceChatStarted.current = true;
      console.log('🎤 Starting auto voice chat after narration completion');
      
      // 나레이션 완료 후 2초 뒤에 자동으로 음성 대화 시작
      setTimeout(() => {
        setShowAutoVoiceChat(true);
      }, 2000);
    }
  }, [hasPlayedWelcomeNarration, isPlayingNarration, showTitleScreen]);

  // 사용자 상호작용 감지 함수
  const generateWelcomeScene = async () => {
    try {
      console.log('환영 장면 생성 중...')
      const response = await fetch('/api/generate-welcome-scene', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        }
      })

      if (response.ok) {
        const result = await response.json()
        console.log('환영 장면 생성 완료:', result.imageUrl)
        setWelcomeSceneImage(result.imageUrl)
      } else {
        console.error('환영 장면 생성 실패 - 서버 응답 오류')
        // 서버 오류 시 기본 배경 이미지 사용
        setWelcomeSceneImage("/placeholder-background.jpg")
      }
    } catch (error) {
      console.error('환영 장면 생성 오류:', error)
      // 네트워크 오류 시 기본 배경 이미지 사용
      setWelcomeSceneImage("/placeholder-background.jpg")
    }
  }

  const handleUserInteraction = () => {
    if (!userHasInteracted) {
      setUserHasInteracted(true)
        console.log('User interaction detected - narration playback available')
      
      // 사용자 상호작용 후 환영 나레이션 재생
      if (!hasPlayedWelcomeNarration) {
        setHasPlayedWelcomeNarration(true)
        // 약간의 지연을 두고 나레이션 재생
        setTimeout(() => {
          playWelcomeNarration()
        }, 100)
      }
    }
  }

  const playWelcomeNarration = async () => {
    try {
      // 이미 재생 중이면 중지
      if (isPlayingNarration) {
        return
      }
      
      setIsPlayingNarration(true)
      const response = await fetch('/api/voice-input', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'tts',
          text: defaultCharacter 
            ? `Hey there, friend! I'm ${defaultCharacter.name}, and I'm so excited to be your adventure buddy! Ready for some amazing fun together?`
            : "Hey there, friend! I'm NanoBanana, and I'm so excited to be your adventure buddy! Ready for some amazing fun together?"
        })
      })

      if (response.ok) {
        const result = await response.json()
        console.log('TTS Audio data received, success:', result.success)
        
        if (result.success && result.audioData) {
          // Base64 데이터를 Blob으로 변환
          const binaryString = atob(result.audioData)
          const bytes = new Uint8Array(binaryString.length)
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i)
          }
          
          const audioBlob = new Blob([bytes], { type: result.contentType || 'audio/mpeg' })
          console.log('Created audio blob from base64, size:', audioBlob.size)
          
          const audioUrl = URL.createObjectURL(audioBlob)
          console.log('Created audio URL:', audioUrl)
          
          const audio = new Audio(audioUrl)
          
          audio.onended = () => {
            setIsPlayingNarration(false)
            URL.revokeObjectURL(audioUrl)
          }
          
          // 오디오 로드 이벤트 추가
          audio.onloadstart = () => {
            console.log('Audio load started')
          }
          
          audio.onloadedmetadata = () => {
            console.log('Audio metadata loaded')
          }
          
          audio.onloadeddata = () => {
            console.log('Audio loaded successfully')
          }
          
          audio.oncanplaythrough = () => {
            console.log('Audio can play through')
          }
          
          audio.onerror = (e) => {
            console.error('Audio error:', e)
            console.error('Audio error details:', audio.error)
            console.error('Audio src:', audio.src)
            setIsPlayingNarration(false)
            URL.revokeObjectURL(audioUrl)
          }
          
          // 오디오가 재생 가능해지면 자동으로 재생
          audio.oncanplay = async () => {
            console.log('Audio can play - starting playback')
            try {
              await audio.play()
              console.log('Audio playback started')
            } catch (playError) {
              console.error('Narration autoplay blocked:', playError)
              setIsPlayingNarration(false)
              URL.revokeObjectURL(audioUrl)
            }
          }
        } else {
          console.error('No audio data received')
          setIsPlayingNarration(false)
        }
      } else {
        console.error('TTS request failed:', response.status)
        setIsPlayingNarration(false)
      }
    } catch (error) {
      console.error('Error during narration playback:', error)
      setIsPlayingNarration(false)
    }
  }

  const handleDialogueNext = () => {
    // 대화 진행 로직 - 자동 음성 채팅 시작
    if (!showAutoVoiceChat && !createdCharacter) {
      setShowAutoVoiceChat(true)
    }
  }

  const handleCharacterCreated = (character: any) => {
    setCreatedCharacter(character)
    setCurrentDialogue({
      character: character.name,
      text: `Amazing! I've created your character "${character.name}"! Let's start our adventure together!`
    })
  }

  const handleStartGame = () => {
    setShowTitleScreen(false);
    setUserHasInteracted(true);
    
    // 바로 ElevenLabsVoiceChat 시작 (환영 장면은 이미 생성됨)
    setShowAutoVoiceChat(true);
  };

  const handleLoadGame = () => {
    console.log('게임 불러오기');
  };

  const handleSettings = () => {
    console.log('설정 열기');
  };

  const handleCredits = () => {
    console.log('제작진 보기');
  };

  const handleExit = () => {
    console.log('게임 종료');
  };


  const handleSave = () => {
    console.log('게임 저장')
  }

  const handleLoad = () => {
    console.log('게임 불러오기')
  }

  const handleLog = () => {
    console.log('대화 기록 열기')
  }

  const handleAuto = () => {
    console.log('자동 진행 토글')
  }

  const handleSkip = () => {
    console.log('빨리감기')
  }


  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-content">
          <div className="loading-spinner"></div>
          <p>게임을 준비하고 있습니다...</p>
        </div>
      </div>
    )
  }

  // 타이틀 화면 렌더링
  if (showTitleScreen) {
    return (
      <TitleScreen
        onStartGame={handleStartGame}
        onLoadGame={handleLoadGame}
        onSettings={handleSettings}
        onCredits={handleCredits}
        onExit={handleExit}
      />
    );
  }

  return (
    <>
      <VisualNovelLayout
        backgroundImage={welcomeSceneImage || characterData?.imageUrl || "/placeholder-background.jpg"}
        showVoiceChat={showAutoVoiceChat}
        onCloseVoiceChat={() => setShowAutoVoiceChat(false)}
        onCharacterCreated={handleCharacterCreated}
      >
        {/* UI 오버레이 - 메뉴 버튼만 */}
        <UIOverlay 
          defaultCharacter={defaultCharacter}
          characterData={characterData}
          onStartAdventure={() => setShowAutoVoiceChat(true)}
        />
          
          {/* 사용자 상호작용 안내 (아직 상호작용하지 않은 경우) */}
          {!userHasInteracted && (
            <div className="interaction-prompt">
              <div className="interaction-prompt-box">
                <h3>🎵 Welcome!</h3>
                <p>Touch the screen to start the game</p>
                <div className="touch-indicator">👆</div>
              </div>
            </div>
          )}

          
          {/* 대화 박스 - ElevenLabsVoiceChat이 열려있지 않고 다이얼로그가 있을 때만 표시 */}
          {!showAutoVoiceChat && currentDialogue.text && (
            <DialogueBox
              characterName={currentDialogue.character}
              dialogue={currentDialogue.text}
              typingSpeed={20} // 음성과 동기화된 타이핑 속도
              enableTTS={false} // TTS 비활성화 (ElevenLabsVoiceChat에서 처리)
              onNext={handleDialogueNext}
              onSave={handleSave}
              onLoad={handleLoad}
              onLog={handleLog}
              onAuto={handleAuto}
              onSkip={handleSkip}
              onSettings={handleSettings}
            />
          )}
          
          {/* 서버 연결 상태 표시 (개발용) */}
          {!serverConnected && (
            <div className="connection-status">
              ⚠️ Server not connected
            </div>
          )}
          
          {/* 나레이션 재생 상태 표시 */}
          {isPlayingNarration && (
            <div className="narration-status">
              🎵 Playing narration...
            </div>
          )}
        </VisualNovelLayout>
    </>
  )
}

export default App
