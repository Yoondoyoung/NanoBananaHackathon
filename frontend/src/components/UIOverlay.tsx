import { useState } from 'react'


interface UIOverlayProps {
  onMenuToggle?: () => void
  defaultCharacter?: any
  characterData?: any
  onStartAdventure?: () => void
}

export default function UIOverlay({
  onMenuToggle,
  defaultCharacter,
  characterData,
  onStartAdventure
}: UIOverlayProps) {
  const [showMenu, setShowMenu] = useState(false)
  const [userCharacter, setUserCharacter] = useState<any>(null)

  const handleMenuToggle = () => {
    setShowMenu(!showMenu)
    onMenuToggle?.()
  }

  // 표시할 캐릭터 결정 (사용자 캐릭터가 있으면 그것을, 없으면 기본 캐릭터를)
  const displayCharacter = userCharacter || characterData || defaultCharacter

  return (
    <div className="ui-overlay">

      {/* 상단 우측 메뉴 버튼 */}
      <div className="top-right-controls">
        <button className="ui-btn menu-btn" onClick={handleMenuToggle}>
          ☰
        </button>
      </div>


      {/* 드롭다운 메뉴 */}
      {showMenu && (
        <div className="dropdown-menu">
          <button className="menu-item">
            💾 Save Game
          </button>
          <button className="menu-item">
            📁 Load Game
          </button>
          <button className="menu-item">
            📖 Dialogue History
          </button>
          <button className="menu-item" onClick={onStartAdventure}>
            🎤 Start Adventure
          </button>
          <button className="menu-item">
            ⚙️ Settings
          </button>
          <button className="menu-item">
            🏠 Main Menu
          </button>
        </div>
      )}

    </div>
  )
}

const styles = `
.ui-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  pointer-events: none;
  z-index: 50;
  padding: 20px;
  box-sizing: border-box;
}

.ui-overlay > * {
  pointer-events: auto;
}

.top-right-controls {
  position: absolute;
  top: 0;
  right: 0;
  background: rgba(255, 255, 255, 0.9);
  padding: 12px;
  border-radius: 12px;
  backdrop-filter: blur(10px);
  border: 2px solid rgba(0, 0, 0, 0.1);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
}


.ui-btn {
  background: rgba(102, 126, 234, 0.1);
  color: #333;
  border: none;
  border-radius: 8px;
  padding: 12px;
  font-size: 16px;
  cursor: pointer;
  transition: all 0.2s ease;
  backdrop-filter: blur(5px);
  border: 1px solid rgba(102, 126, 234, 0.2);
  min-width: 44px;
  min-height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.ui-btn:hover {
  background: rgba(102, 126, 234, 0.2);
  transform: scale(1.05);
  box-shadow: 0 2px 8px rgba(102, 126, 234, 0.3);
}

.ui-btn:active {
  transform: scale(0.95);
}

.ui-btn.small {
  padding: 8px;
  font-size: 14px;
  min-width: 36px;
  min-height: 36px;
}

.ui-btn.active {
  background: rgba(102, 126, 234, 0.3);
  border-color: rgba(102, 126, 234, 0.5);
  color: #667eea;
  font-weight: 600;
}

.menu-btn {
  font-size: 18px;
  font-weight: bold;
}

.dropdown-menu {
  position: absolute;
  top: 60px;
  right: 0;
  background: rgba(255, 255, 255, 0.95);
  border-radius: 12px;
  padding: 8px;
  min-width: 180px;
  backdrop-filter: blur(20px);
  border: 2px solid rgba(0, 0, 0, 0.1);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
}


.menu-item {
  display: block;
  width: 100%;
  background: none;
  color: #333;
  border: none;
  padding: 12px 16px;
  text-align: left;
  cursor: pointer;
  border-radius: 8px;
  font-size: 14px;
  transition: background 0.2s ease;
}

.menu-item:hover {
  background: rgba(102, 126, 234, 0.1);
  color: #667eea;
}

/* iPad 최적화 */
@media (min-width: 768px) and (max-width: 1024px) {
  .ui-overlay {
    padding: 32px;
  }
  
  .top-right-controls {
    padding: 16px;
  }
  
  .ui-btn {
    padding: 16px;
    font-size: 18px;
    min-width: 48px;
    min-height: 48px;
  }
}

/* 세로 모드 */
@media (orientation: portrait) {
  .ui-overlay {
    padding: 24px;
  }
}
`

// 스타일을 head에 추가
if (typeof document !== 'undefined') {
  const styleSheet = document.createElement("style")
  styleSheet.innerText = styles
  document.head.appendChild(styleSheet)
}
