import React, { useState, useRef, useEffect } from 'react'

interface VoiceCharacterCreationProps {
  onComplete?: (characterData: any) => void
  onBack?: () => void
}

interface CharacterData {
  name?: string
  heroType?: string
  appearance?: string
  imageUrl?: string
}

export default function VoiceCharacterCreation({ 
  onComplete, 
  onBack 
}: VoiceCharacterCreationProps) {
  const [isRecording, setIsRecording] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [currentStep, setCurrentStep] = useState(0)
  const [characterData, setCharacterData] = useState<CharacterData>({})
  const [currentPrompt, setCurrentPrompt] = useState("")
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPlayingAudio, setIsPlayingAudio] = useState(false)
  const isPlayingRef = useRef(false)
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const conversationSteps = [
    {
      prompt: "안녕하세요! 저는 여러분의 캐릭터를 만들어드릴 특별한 도우미입니다. 먼저 이름을 알려주세요!",
      field: "name"
    },
    {
      prompt: "멋진 이름이네요! 이제 어떤 종류의 영웅이 되고 싶으신가요? 예를 들어, 마법사, 기사, 탐험가, 과학자 등이 있어요.",
      field: "heroType"
    },
    {
      prompt: "훌륭한 선택입니다! 마지막으로 외모는 어떻게 하고 싶으신가요? 머리 색깔, 옷 스타일, 특별한 특징 등을 말씀해주세요.",
      field: "appearance"
    }
  ]

  useEffect(() => {
    if (currentStep < conversationSteps.length) {
      console.log('Starting step:', currentStep, conversationSteps[currentStep].prompt)
      setCurrentPrompt(conversationSteps[currentStep].prompt)
      playAudioResponse(conversationSteps[currentStep].prompt)
    }
  }, [currentStep])


  const playAudioResponse = async (text: string) => {
    try {
      // 이미 재생 중이면 중복 실행 방지
      if (isPlayingRef.current) {
        console.log('Audio already playing, skipping...')
        return
      }
      
      console.log('Playing audio response:', text)
      isPlayingRef.current = true
      
      // 이전 오디오가 재생 중이면 중지
      if (audioRef.current && !audioRef.current.paused) {
        audioRef.current.pause()
        audioRef.current.currentTime = 0
      }
      
      setIsPlayingAudio(true)
      console.log('Set isPlayingAudio to true')
      const response = await fetch('/api/voice-input', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          action: 'narration',
          text: text,
          voiceId: 'jBpfuIE2acCO8z3wKNLl'
        }),
      })

      if (response.ok) {
        const result = await response.json()
        console.log('TTS Audio URL received:', result.audioUrl)
        
        if (!result.audioUrl) {
          console.error('No audio URL received for TTS')
          setIsPlayingAudio(false)
          return
        }
        
        setAudioUrl(result.audioUrl)
        
        if (audioRef.current) {
          audioRef.current.src = result.audioUrl
          audioRef.current.onended = () => {
            console.log('Audio playback ended')
            setIsPlayingAudio(false)
            isPlayingRef.current = false
          }
          audioRef.current.onerror = () => {
            console.log('Audio playback error')
            setIsPlayingAudio(false)
            isPlayingRef.current = false
          }
          await audioRef.current.play()
        }
      } else {
        setIsPlayingAudio(false)
      }
    } catch (err) {
      console.error('Error playing audio:', err)
      setIsPlayingAudio(false)
      isPlayingRef.current = false
    }
  }

  const startRecording = async () => {
    try {
      console.log('🎤 녹음 시작 버튼 클릭됨')
      console.log('📱 마이크 권한 요청 중...')
      
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      console.log('✅ 마이크 권한 획득 성공')
      
      const mediaRecorder = new MediaRecorder(stream)
      mediaRecorderRef.current = mediaRecorder
      audioChunksRef.current = []
      console.log('🎙️ MediaRecorder 생성 완료')

      mediaRecorder.ondataavailable = (event) => {
        console.log('📊 오디오 데이터 수신:', event.data.size, 'bytes')
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      }

      mediaRecorder.onstop = async () => {
        console.log('⏹️ 녹음 중지됨, 오디오 처리 시작')
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' })
        console.log('🎵 오디오 블롭 생성:', audioBlob.size, 'bytes')
        await processAudio(audioBlob)
        stream.getTracks().forEach(track => track.stop())
      }

      mediaRecorder.start()
      console.log('▶️ 녹음 시작됨')
      setIsRecording(true)
      setError(null)
      console.log('🔄 isRecording 상태를 true로 설정')
    } catch (err) {
      console.error('❌ 마이크 접근 오류:', err)
      setError('마이크 접근 권한이 필요합니다.')
    }
  }

  // 전역으로 함수 노출 (디버깅용)
  useEffect(() => {
    (window as any).startRecording = startRecording
    return () => {
      delete (window as any).startRecording
    }
  }, [])

  const stopRecording = () => {
    console.log('⏹️ 녹음 중지 버튼 클릭됨')
    console.log('📊 현재 상태:', { 
      hasMediaRecorder: !!mediaRecorderRef.current, 
      isRecording 
    })
    
    if (mediaRecorderRef.current && isRecording) {
      console.log('🛑 녹음 중지 중...')
      mediaRecorderRef.current.stop()
      setIsRecording(false)
      console.log('✅ 녹음 중지 완료')
    } else {
      console.log('⚠️ 녹음 중지 조건 불만족')
    }
  }

  const processAudio = async (audioBlob: Blob) => {
    setIsProcessing(true)
    setError(null)

    try {
      const formData = new FormData()
      formData.append('audio', audioBlob, 'recording.wav')
      formData.append('step', currentStep.toString())
      formData.append('field', conversationSteps[currentStep].field)

      const response = await fetch('/api/voice-input', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        throw new Error('서버 응답 오류')
      }

      const result = await response.json()
      
      if (result.success) {
        // Update character data
        const newCharacterData = {
          ...characterData,
          [conversationSteps[currentStep].field]: result.transcription
        }
        setCharacterData(newCharacterData)

        // Move to next step or complete
        if (currentStep < conversationSteps.length - 1) {
          setCurrentStep(currentStep + 1)
        } else {
          // Generate final character
          await generateFinalCharacter(newCharacterData)
        }
      } else {
        setError(result.error || '음성 인식에 실패했습니다.')
      }
    } catch (err) {
      setError('오류가 발생했습니다. 다시 시도해주세요.')
      console.error('Error processing audio:', err)
    } finally {
      setIsProcessing(false)
    }
  }

  const generateFinalCharacter = async (data: CharacterData) => {
    setIsProcessing(true)
    
    try {
      const response = await fetch('/api/voice-input', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          action: 'generate_character',
          characterData: data 
        }),
      })

      if (response.ok) {
        const result = await response.json()
        if (result.success) {
          const finalCharacterData = {
            ...data,
            imageUrl: result.imageUrl
          }
          setCharacterData(finalCharacterData)
          
          // Play final message
          await playAudioResponse(result.finalMessage)
          
          // Complete after a delay
          setTimeout(() => {
            onComplete?.(finalCharacterData)
          }, 3000)
        } else {
          setError(result.error || '캐릭터 생성에 실패했습니다.')
        }
      }
    } catch (err) {
      setError('캐릭터 생성 중 오류가 발생했습니다.')
      console.error('Error generating character:', err)
    } finally {
      setIsProcessing(false)
    }
  }

  const handleStart = () => {
    setCurrentStep(0)
    setCharacterData({})
    setError(null)
  }

  return (
    <div className="voice-character-creation">
      <div className="creation-container">
        <h2 className="creation-title">🎤 음성으로 캐릭터 만들기</h2>
        
        {currentStep === 0 && !characterData.name && (
          <div className="start-section">
            <p className="start-description">
              마이크를 사용해서 대화하며 나만의 캐릭터를 만들어보세요!
            </p>
            <button 
              className="start-button"
              onClick={handleStart}
              disabled={isProcessing}
            >
              {isProcessing ? '준비 중...' : '시작하기'}
            </button>
          </div>
        )}

        {currentStep > 0 && (
          <div className="conversation-section">
            <div className="prompt-display">
              <h3>🤖 AI 도우미:</h3>
              <p className="prompt-text">{currentPrompt}</p>
              <div className="step-indicator">
                <span>단계 {currentStep} / {conversationSteps.length}</span>
              </div>
            </div>

            <div className="character-progress">
              <h4>수집된 정보:</h4>
              {characterData.name && (
                <p>이름: {characterData.name}</p>
              )}
              {characterData.heroType && (
                <p>영웅 타입: {characterData.heroType}</p>
              )}
              {characterData.appearance && (
                <p>외모: {characterData.appearance}</p>
              )}
            </div>

            <div className="recording-controls">
              {/* 디버깅 정보 */}
              <div style={{fontSize: '12px', color: '#666', marginBottom: '10px'}}>
                Debug: currentStep={currentStep}, isRecording={isRecording.toString()}, isPlayingAudio={isPlayingAudio.toString()}
                <br />
                {isRecording && <span style={{color: 'red', fontWeight: 'bold'}}>🎤 녹음 중입니다!</span>}
              </div>
              
              {!isRecording && !isPlayingAudio ? (
                <div className="recording-prompt">
                  <p className="recording-instruction">
                    {currentStep === 0 && "이름을 말씀해주세요"}
                    {currentStep === 1 && "영웅 타입을 말씀해주세요"}
                    {currentStep === 2 && "외모를 설명해주세요"}
                  </p>
                  <button 
                    className="record-button"
                    onClick={startRecording}
                    disabled={isProcessing}
                    style={{
                      background: 'linear-gradient(135deg, #667eea, #764ba2)',
                      color: 'white',
                      border: 'none',
                      borderRadius: '50px',
                      padding: '18px 40px',
                      fontSize: '20px',
                      fontWeight: '600',
                      cursor: 'pointer',
                      boxShadow: '0 8px 25px rgba(102, 126, 234, 0.3)',
                      transition: 'all 0.3s ease'
                    }}
                  >
                    🎤 녹음 시작
                  </button>
                </div>
              ) : isRecording ? (
                <div className="recording-status">
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: '20px'
                  }}>
                    <div style={{
                      width: '20px',
                      height: '20px',
                      borderRadius: '50%',
                      background: '#e74c3c',
                      marginRight: '10px',
                      animation: 'pulse 1.5s infinite'
                    }}></div>
                    <span style={{color: '#e74c3c', fontWeight: '600', fontSize: '18px'}}>
                      🎤 녹음 중입니다...
                    </span>
                  </div>
                  <button 
                    className="stop-button"
                    onClick={stopRecording}
                    style={{
                      background: 'linear-gradient(135deg, #e74c3c, #c0392b)',
                      color: 'white',
                      border: 'none',
                      borderRadius: '50px',
                      padding: '18px 40px',
                      fontSize: '20px',
                      fontWeight: '600',
                      cursor: 'pointer',
                      boxShadow: '0 8px 25px rgba(231, 76, 60, 0.3)',
                      transition: 'all 0.3s ease'
                    }}
                  >
                    ⏹️ 녹음 중지
                  </button>
                </div>
              ) : (
                <div style={{color: '#999', fontSize: '14px'}}>
                  {isPlayingAudio ? 'AI가 말하고 있습니다...' : '대기 중...'}
                </div>
              )}
            </div>


            {isProcessing && (
              <div className="processing-indicator">
                <div className="spinner"></div>
                <span>처리 중...</span>
              </div>
            )}

            {isPlayingAudio && (
              <div className="audio-playing-modal">
                <div className="audio-playing-content">
                  <div className="audio-wave-animation">
                    <div className="wave-bar"></div>
                    <div className="wave-bar"></div>
                    <div className="wave-bar"></div>
                    <div className="wave-bar"></div>
                    <div className="wave-bar"></div>
                  </div>
                  <h3>🔊 AI가 말하고 있어요</h3>
                  <p>잠시만 기다려주세요...</p>
                </div>
              </div>
            )}

          </div>
        )}

        {characterData.imageUrl && (
          <div className="character-result">
            <h3>🎉 캐릭터가 완성되었습니다!</h3>
            <img 
              src={characterData.imageUrl} 
              alt="생성된 캐릭터"
              className="character-image"
            />
            <div className="character-info">
              <p><strong>이름:</strong> {characterData.name}</p>
              <p><strong>타입:</strong> {characterData.heroType}</p>
              <p><strong>외모:</strong> {characterData.appearance}</p>
            </div>
          </div>
        )}

        {error && (
          <div className="error-message">
            ⚠️ {error}
          </div>
        )}

        {onBack && (
          <button className="back-button" onClick={onBack}>
            ← 돌아가기
          </button>
        )}

        <audio ref={audioRef} />
      </div>
    </div>
  )
}

const styles = `
.voice-character-creation {
  position: absolute;
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

.creation-container {
  background: rgba(255, 255, 255, 0.95);
  border-radius: 20px;
  padding: 40px;
  max-width: 600px;
  width: 90%;
  max-height: 80vh;
  overflow-y: auto;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  backdrop-filter: blur(20px);
}

.creation-title {
  text-align: center;
  color: #333;
  margin-bottom: 30px;
  font-size: 28px;
  font-weight: 700;
}

.start-section {
  text-align: center;
}

.start-description {
  font-size: 18px;
  color: #666;
  margin-bottom: 30px;
  line-height: 1.6;
}

.start-button {
  background: linear-gradient(45deg, #667eea, #764ba2);
  color: white;
  border: none;
  border-radius: 12px;
  padding: 16px 32px;
  font-size: 18px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;
  box-shadow: 0 4px 15px rgba(102, 126, 234, 0.3);
}

.start-button:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(102, 126, 234, 0.4);
}

.start-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.conversation-section {
  text-align: center;
}

.prompt-display {
  background: rgba(102, 126, 234, 0.1);
  border-radius: 12px;
  padding: 20px;
  margin-bottom: 20px;
  border-left: 4px solid #667eea;
}

.prompt-display h3 {
  color: #667eea;
  margin-bottom: 10px;
  font-size: 18px;
}

.prompt-text {
  font-size: 16px;
  color: #333;
  line-height: 1.6;
  margin: 0;
}

.character-progress {
  background: rgba(46, 204, 113, 0.1);
  border-radius: 12px;
  padding: 20px;
  margin-bottom: 20px;
  text-align: left;
}

.character-progress h4 {
  color: #2ecc71;
  margin-bottom: 10px;
  font-size: 16px;
}

.character-progress p {
  margin: 5px 0;
  color: #333;
  font-size: 14px;
}

.recording-controls {
  margin: 20px 0;
}

.record-button, .stop-button {
  background: linear-gradient(45deg, #e74c3c, #c0392b);
  color: white;
  border: none;
  border-radius: 50px;
  padding: 20px 40px;
  font-size: 18px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;
  box-shadow: 0 4px 15px rgba(231, 76, 60, 0.3);
}

.record-button {
  background: linear-gradient(45deg, #2ecc71, #27ae60);
  box-shadow: 0 4px 15px rgba(46, 204, 113, 0.3);
}

.record-button:hover:not(:disabled), .stop-button:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(46, 204, 113, 0.4);
}

.record-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.recording-indicator, .processing-indicator {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  margin: 20px 0;
  color: #e74c3c;
  font-weight: 600;
}

.processing-indicator {
  color: #667eea;
}

.audio-playing-indicator {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  margin: 20px 0;
  color: #9b59b6;
  font-weight: 600;
}

/* 녹음 모달 */
.recording-modal {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
}

.recording-modal .modal-content {
  background: white;
  border-radius: 20px;
  padding: 40px;
  text-align: center;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
  max-width: 400px;
  width: 90%;
}

.recording-icon {
  font-size: 60px;
  margin-bottom: 20px;
  animation: pulse 2s infinite;
}

.recording-modal h3 {
  color: #2c3e50;
  margin-bottom: 15px;
  font-size: 24px;
  font-weight: 700;
}

.recording-modal .recording-instruction {
  color: #e74c3c;
  font-size: 18px;
  font-weight: 600;
  margin-bottom: 30px;
  line-height: 1.4;
}

.recording-modal .record-button {
  background: linear-gradient(135deg, #e74c3c, #c0392b);
  color: white;
  border: none;
  border-radius: 50px;
  padding: 15px 30px;
  font-size: 18px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;
  box-shadow: 0 8px 20px rgba(231, 76, 60, 0.3);
}

.recording-modal .record-button:hover {
  transform: translateY(-2px);
  box-shadow: 0 12px 25px rgba(231, 76, 60, 0.4);
}

.recording-modal .record-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  transform: none;
}

@keyframes pulse {
  0% { transform: scale(1); }
  50% { transform: scale(1.1); }
  100% { transform: scale(1); }
}

.recording-content {
  background: rgba(255, 255, 255, 0.95);
  border-radius: 20px;
  padding: 40px;
  text-align: center;
  max-width: 400px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  backdrop-filter: blur(20px);
}

.recording-animation {
  position: relative;
  width: 100px;
  height: 100px;
  margin: 0 auto 20px;
}

.pulse-circle {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 20px;
  height: 20px;
  background: #e74c3c;
  border-radius: 50%;
  animation: pulse-expand 2s infinite;
}

.pulse-circle.delay-1 {
  animation-delay: 0.3s;
}

.pulse-circle.delay-2 {
  animation-delay: 0.6s;
}

@keyframes pulse-expand {
  0% {
    transform: translate(-50%, -50%) scale(1);
    opacity: 1;
  }
  100% {
    transform: translate(-50%, -50%) scale(4);
    opacity: 0;
  }
}

.recording-content h3 {
  color: #e74c3c;
  margin-bottom: 10px;
  font-size: 24px;
  font-weight: 700;
}

.recording-content p {
  color: #666;
  margin-bottom: 15px;
  font-size: 16px;
}

.recording-timer {
  color: #e74c3c;
  font-weight: 600;
  font-size: 14px;
}

/* 오디오 재생 모달 */
.audio-playing-modal {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
}

.audio-playing-content {
  background: rgba(255, 255, 255, 0.95);
  border-radius: 20px;
  padding: 40px;
  text-align: center;
  max-width: 400px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  backdrop-filter: blur(20px);
}

.audio-wave-animation {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 3px;
  margin: 0 auto 20px;
  height: 40px;
}

.wave-bar {
  width: 4px;
  background: #9b59b6;
  border-radius: 2px;
  animation: wave 1.5s infinite ease-in-out;
}

.wave-bar:nth-child(1) { animation-delay: 0s; }
.wave-bar:nth-child(2) { animation-delay: 0.1s; }
.wave-bar:nth-child(3) { animation-delay: 0.2s; }
.wave-bar:nth-child(4) { animation-delay: 0.3s; }
.wave-bar:nth-child(5) { animation-delay: 0.4s; }

@keyframes wave {
  0%, 40%, 100% {
    height: 10px;
  }
  20% {
    height: 30px;
  }
}

.audio-playing-content h3 {
  color: #9b59b6;
  margin-bottom: 10px;
  font-size: 24px;
  font-weight: 700;
}

.audio-playing-content p {
  color: #666;
  font-size: 16px;
}

/* 단계 표시기 */
.step-indicator {
  margin-top: 10px;
  padding: 5px 15px;
  background: rgba(102, 126, 234, 0.1);
  border-radius: 15px;
  display: inline-block;
}

.step-indicator span {
  color: #667eea;
  font-size: 12px;
  font-weight: 600;
}

/* 녹음 안내 */
.recording-prompt {
  text-align: center;
}

.recording-instruction {
  color: #e74c3c;
  font-weight: 600;
  margin-bottom: 15px;
  font-size: 16px;
}

.pulse-dot {
  width: 12px;
  height: 12px;
  background: #e74c3c;
  border-radius: 50%;
  animation: pulse 1s infinite;
}

.spinner {
  width: 20px;
  height: 20px;
  border: 2px solid #f3f3f3;
  border-top: 2px solid #667eea;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes pulse {
  0% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.2); opacity: 0.7; }
  100% { transform: scale(1); opacity: 1; }
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.character-result {
  text-align: center;
  margin-top: 20px;
}

.character-result h3 {
  color: #2ecc71;
  margin-bottom: 20px;
  font-size: 24px;
}

.character-image {
  max-width: 200px;
  max-height: 200px;
  border-radius: 12px;
  box-shadow: 0 8px 25px rgba(0, 0, 0, 0.2);
  margin-bottom: 20px;
}

.character-info {
  background: rgba(102, 126, 234, 0.1);
  border-radius: 12px;
  padding: 20px;
  text-align: left;
}

.character-info p {
  margin: 8px 0;
  color: #333;
}

.error-message {
  background: rgba(231, 76, 60, 0.1);
  color: #e74c3c;
  padding: 15px;
  border-radius: 8px;
  margin: 20px 0;
  text-align: center;
  font-weight: 600;
}

.back-button {
  background: rgba(52, 73, 94, 0.1);
  color: #34495e;
  border: 2px solid rgba(52, 73, 94, 0.2);
  border-radius: 8px;
  padding: 12px 24px;
  font-size: 16px;
  cursor: pointer;
  transition: all 0.2s ease;
  margin-top: 20px;
}

.back-button:hover {
  background: rgba(52, 73, 94, 0.2);
  transform: translateY(-1px);
}

/* iPad 최적화 */
@media (min-width: 768px) and (max-width: 1024px) {
  .creation-container {
    padding: 50px;
    max-width: 700px;
  }
  
  .creation-title {
    font-size: 32px;
  }
  
  .start-description {
    font-size: 20px;
  }
  
  .start-button {
    padding: 20px 40px;
    font-size: 20px;
  }
  
  .record-button, .stop-button {
    padding: 24px 48px;
    font-size: 20px;
  }
}
`

// 스타일을 head에 추가
if (typeof document !== 'undefined') {
  const styleSheet = document.createElement("style")
  styleSheet.innerText = styles
  document.head.appendChild(styleSheet)
}
