import React from 'react'
import ElevenLabsVoiceChat from './ElevenLabsVoiceChat'

interface VisualNovelLayoutProps {
  children: React.ReactNode
  backgroundImage?: string
  showVoiceChat?: boolean
  onCloseVoiceChat?: () => void
  onCharacterCreated?: (character: any) => void
}

export default function VisualNovelLayout({ 
  children, 
  backgroundImage = '/placeholder-background.jpg',
  showVoiceChat = false,
  onCloseVoiceChat,
  onCharacterCreated
}: VisualNovelLayoutProps) {
  return (
    <div className="visual-novel-layout">
      {/* 메인 프레임 */}
      <div className="main-frame">
        {/* 배경 이미지 */}
        <div 
          className="background-image"
          style={{ backgroundImage: `url(${backgroundImage})` }}
        />
        
        {/* 오버레이 콘텐츠 */}
        <div className="content-overlay">
          {children}
        </div>
        
        {/* Voice Chat within VisualNovelLayout */}
        {showVoiceChat && onCloseVoiceChat && onCharacterCreated && (
          <ElevenLabsVoiceChat 
            onClose={onCloseVoiceChat}
            onCharacterCreated={onCharacterCreated}
          />
        )}
      </div>
    </div>
  )
}

const styles = `
.visual-novel-layout {
  position: relative;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  background: linear-gradient(45deg, #2c3e50, #34495e);
  padding: 16px;
  box-sizing: border-box;
}

.main-frame {
  position: relative;
  width: 100%;
  height: 100%;
  border: 4px solid rgba(255, 255, 255, 0.3);
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 
    0 0 0 2px rgba(0, 0, 0, 0.2),
    inset 0 0 0 2px rgba(255, 255, 255, 0.1),
    0 8px 32px rgba(0, 0, 0, 0.3);
  background: rgba(0, 0, 0, 0.1);
}

.background-image {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
  background-color: #2c3e50;
}

.content-overlay {
  position: relative;
  width: 100%;
  height: 100%;
  z-index: 1;
}


/* 데스크탑 최적화 - 이미지 전체 표시 */
@media (min-width: 1200px) {
  .background-image {
    background-size: contain;
    background-color: #2c3e50;
  }
}

/* 큰 데스크탑 화면 (21:9 등) */
@media (min-width: 1600px) {
  .background-image {
    background-size: contain;
    background-color: #2c3e50;
  }
  
  .visual-novel-layout {
    padding: 32px;
  }
  
  .main-frame {
    border-width: 8px;
    border-radius: 20px;
  }
}

/* iPad 최적화 */
@media (min-width: 768px) and (max-width: 1024px) {
  .visual-novel-layout {
    padding: 24px;
  }
  
  .main-frame {
    border-width: 6px;
    border-radius: 16px;
  }
}

/* 작은 화면 대응 */
@media (max-width: 767px) {
  .visual-novel-layout {
    padding: 12px;
  }
  
  .main-frame {
    border-width: 3px;
    border-radius: 8px;
  }
}
`

// 스타일을 head에 추가
if (typeof document !== 'undefined') {
  const styleSheet = document.createElement("style")
  styleSheet.innerText = styles
  document.head.appendChild(styleSheet)
}
