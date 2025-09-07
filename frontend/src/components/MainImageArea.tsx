import React, { useState } from 'react'

interface MainImageAreaProps {
  currentImage?: string
  altText?: string
}

export default function MainImageArea({ 
  currentImage = '/placeholder-scene.jpg', 
  altText = '게임 장면' 
}: MainImageAreaProps) {
  const [imageLoaded, setImageLoaded] = useState(false)

  return (
    <div className="main-image-area">
      <div className="image-container">
        {!imageLoaded && (
          <div className="image-placeholder">
            <div className="loading-spinner"></div>
            <p>이미지 로딩 중...</p>
          </div>
        )}
        <img 
          src={currentImage}
          alt={altText}
          onLoad={() => setImageLoaded(true)}
          onError={() => setImageLoaded(false)}
          style={{ opacity: imageLoaded ? 1 : 0 }}
        />
        
        {/* 오버레이 UI */}
        <div className="image-overlay">
          <div className="character-name">캐릭터 이름</div>
        </div>
      </div>
      
      {/* 텍스트 박스 */}
      <div className="dialogue-box">
        <p className="dialogue-text">
          안녕하세요! 저는 여러분의 학습 도우미입니다. 
          함께 재미있는 모험을 떠나볼까요? 🌟
        </p>
      </div>
    </div>
  )
}

const styles = `
.main-image-area {
  grid-area: main-content;
  display: flex;
  flex-direction: column;
  background: rgba(255, 255, 255, 0.95);
  border-radius: 20px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
  overflow: hidden;
  position: relative;
}

.image-container {
  flex: 1;
  position: relative;
  background: linear-gradient(45deg, #f0f8ff, #e6f3ff);
  display: flex;
  align-items: center;
  justify-content: center;
}

.image-container img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: opacity 0.3s ease;
}

.image-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #666;
  font-size: 18px;
}

.loading-spinner {
  width: 40px;
  height: 40px;
  border: 4px solid #f3f3f3;
  border-top: 4px solid #667eea;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 16px;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.image-overlay {
  position: absolute;
  top: 20px;
  left: 20px;
  right: 20px;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}

.character-name {
  background: rgba(0, 0, 0, 0.7);
  color: white;
  padding: 8px 16px;
  border-radius: 20px;
  font-weight: 600;
  font-size: 16px;
}

.dialogue-box {
  background: rgba(255, 255, 255, 0.98);
  padding: 24px;
  margin: 16px;
  border-radius: 16px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  border-left: 4px solid #667eea;
}

.dialogue-text {
  font-size: 18px;
  line-height: 1.6;
  color: #333;
  margin: 0;
}

/* iPad 최적화 */
@media (min-width: 768px) and (max-width: 1024px) {
  .dialogue-text {
    font-size: 20px;
  }
  
  .character-name {
    font-size: 18px;
  }
}
`

// 스타일을 head에 추가
if (typeof document !== 'undefined') {
  const styleSheet = document.createElement("style")
  styleSheet.innerText = styles
  document.head.appendChild(styleSheet)
}
