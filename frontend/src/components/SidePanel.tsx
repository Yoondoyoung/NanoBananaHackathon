import React from 'react'

interface SidePanelProps {
  side: 'left' | 'right'
  children: React.ReactNode
}

export default function SidePanel({ side, children }: SidePanelProps) {
  return (
    <div className={`side-panel side-panel-${side}`}>
      {children}
    </div>
  )
}

// 인벤토리 컴포넌트
export function InventoryPanel() {
  const items = [
    { id: 1, name: '마법의 책', icon: '📚', count: 3 },
    { id: 2, name: '에너지 포션', icon: '🧪', count: 5 },
    { id: 3, name: '별 조각', icon: '⭐', count: 12 }
  ]

  return (
    <div className="inventory-panel">
      <h3 className="panel-title">📦 인벤토리</h3>
      <div className="items-grid">
        {items.map(item => (
          <div key={item.id} className="item-slot interactive">
            <div className="item-icon">{item.icon}</div>
            <div className="item-count">{item.count}</div>
            <div className="item-name">{item.name}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

// 업적 패널
export function AchievementPanel() {
  const achievements = [
    { id: 1, name: '첫 걸음', description: '게임을 시작했습니다', completed: true, icon: '🎯' },
    { id: 2, name: '학습자', description: '첫 번째 레슨 완료', completed: true, icon: '📖' },
    { id: 3, name: '탐험가', description: '새로운 지역 발견', completed: false, icon: '🗺️' }
  ]

  return (
    <div className="achievement-panel">
      <h3 className="panel-title">🏆 업적</h3>
      <div className="achievements-list">
        {achievements.map(achievement => (
          <div key={achievement.id} className={`achievement-item ${achievement.completed ? 'completed' : 'locked'}`}>
            <div className="achievement-icon">{achievement.icon}</div>
            <div className="achievement-info">
              <div className="achievement-name">{achievement.name}</div>
              <div className="achievement-desc">{achievement.description}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

const styles = `
.side-panel {
  background: rgba(255, 255, 255, 0.9);
  border-radius: 16px;
  padding: 20px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  backdrop-filter: blur(10px);
  overflow-y: auto;
}

.side-panel-left {
  grid-area: left-panel;
}

.side-panel-right {
  grid-area: right-panel;
}

.panel-title {
  font-size: 18px;
  font-weight: 700;
  color: #333;
  margin-bottom: 16px;
  text-align: center;
}

/* 인벤토리 스타일 */
.inventory-panel {
  height: 100%;
}

.items-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;
}

.item-slot {
  background: rgba(102, 126, 234, 0.05);
  border: 2px solid rgba(102, 126, 234, 0.1);
  border-radius: 12px;
  padding: 12px;
  text-align: center;
  transition: all 0.2s ease;
  position: relative;
}

.item-slot:hover {
  background: rgba(102, 126, 234, 0.1);
  border-color: rgba(102, 126, 234, 0.3);
  transform: translateY(-2px);
}

.item-icon {
  font-size: 24px;
  margin-bottom: 8px;
}

.item-count {
  position: absolute;
  top: -8px;
  right: -8px;
  background: #667eea;
  color: white;
  border-radius: 50%;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: bold;
}

.item-name {
  font-size: 12px;
  color: #666;
  margin-top: 4px;
}

/* 업적 스타일 */
.achievement-panel {
  height: 100%;
}

.achievements-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.achievement-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border-radius: 12px;
  transition: all 0.2s ease;
}

.achievement-item.completed {
  background: rgba(46, 204, 113, 0.1);
  border: 2px solid rgba(46, 204, 113, 0.2);
}

.achievement-item.locked {
  background: rgba(149, 165, 166, 0.1);
  border: 2px solid rgba(149, 165, 166, 0.2);
  opacity: 0.6;
}

.achievement-icon {
  font-size: 20px;
  width: 32px;
  text-align: center;
}

.achievement-info {
  flex: 1;
}

.achievement-name {
  font-size: 14px;
  font-weight: 600;
  color: #333;
  margin-bottom: 2px;
}

.achievement-desc {
  font-size: 12px;
  color: #666;
  line-height: 1.3;
}

/* 세로 모드 대응 */
@media (orientation: portrait) {
  .side-panel-left,
  .side-panel-right {
    grid-area: side-panels;
  }
  
  .items-grid {
    grid-template-columns: repeat(auto-fit, minmax(80px, 1fr));
  }
}
`

// 스타일을 head에 추가
if (typeof document !== 'undefined') {
  const styleSheet = document.createElement("style")
  styleSheet.innerText = styles
  document.head.appendChild(styleSheet)
}
