import React from 'react';

// Props 타입 정의
interface TitleScreenProps {
  onStartGame: () => void;
  onLoadGame: () => void;
  onSettings: () => void;
  onCredits: () => void;
  onExit: () => void;
}

const TitleScreen: React.FC<TitleScreenProps> = ({ 
  onStartGame, 
  onLoadGame, 
  onSettings, 
  onCredits,
  onExit
}) => {
  return (
    <>
      <div className="title-screen">
        <div className="title-background"></div>
        
        
        {/* 메뉴 영역 */}
        <div className="menu-section">
          <div className="game-title-area">
            <h1 className="game-title">Nano Banana Adventure</h1>
            <p className="game-subtitle">A Magical Detective Story</p>
            <div className="title-icon">💬</div>
          </div>
          
          <div className="menu-buttons">
            <button className="menu-button primary" onClick={onStartGame}>
              <span className="button-icon">❤️</span>
              <span className="button-text">Start New Game</span>
            </button>
            
            <div className="menu-row">
              <button className="menu-button secondary" onClick={onLoadGame}>
                <span className="button-icon">📁</span>
                <span className="button-text">Load Game</span>
              </button>
              <button className="menu-button secondary" onClick={onSettings}>
                <span className="button-icon">⚙️</span>
                <span className="button-text">Settings</span>
              </button>
            </div>
            
            <div className="menu-row">
              <button className="menu-button secondary" onClick={onCredits}>
                <span className="button-icon">🎬</span>
                <span className="button-text">Credits</span>
              </button>
              <button className="menu-button secondary" onClick={onExit}>
                <span className="button-icon">❌</span>
                <span className="button-text">Exit Game</span>
              </button>
            </div>
          </div>
          
        </div>
      </div>

      <style>{`
        .title-screen {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          z-index: 1000;
          overflow: hidden;
        }

        .title-background {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background-image: url('https://wvmkurseomwhrzamqadk.supabase.co/storage/v1/object/public/character-images/background-images/Gemini_Generated_Image_t52r0it52r0it52r.png');
          background-size: contain;
          background-position: center;
          background-repeat: no-repeat;
          z-index: 1;
        }

        .title-background::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: linear-gradient(135deg, rgba(102, 126, 234, 0.1) 0%, rgba(118, 75, 162, 0.1) 100%);
          z-index: 2;
        }


        .menu-section {
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          padding: 2rem;
          z-index: 3;
          max-width: 600px;
          width: 100%;
        }

        .game-title-area {
          text-align: center;
          margin-bottom: 3rem;
          position: relative;
        }

        .game-title {
          font-size: 3.5rem;
          font-weight: 800;
          margin-bottom: 0.5rem;
          color: #ffffff;
          text-shadow: 0 6px 12px rgba(0, 0, 0, 0.8);
          background: linear-gradient(45deg, #ffd700, #ffed4e, #ffffff);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          letter-spacing: 2px;
        }

        .game-subtitle {
          font-size: 1.4rem;
          color: #e8f4fd;
          margin-bottom: 1rem;
          text-shadow: 0 3px 6px rgba(0, 0, 0, 0.6);
          font-weight: 300;
          letter-spacing: 1px;
        }

        .title-icon {
          position: absolute;
          top: -10px;
          right: -20px;
          font-size: 1.5rem;
          opacity: 0.7;
        }

        .menu-buttons {
          display: flex;
          flex-direction: column;
          gap: 1rem;
          margin-bottom: 2rem;
        }

        .menu-row {
          display: flex;
          gap: 1rem;
        }

        .menu-button {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 1.2rem 2rem;
          border: none;
          border-radius: 16px;
          font-size: 1.1rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
          box-shadow: 0 8px 16px rgba(0, 0, 0, 0.2);
          flex: 1;
          backdrop-filter: blur(10px);
          position: relative;
          overflow: hidden;
        }

        .menu-button::before {
          content: '';
          position: absolute;
          top: 0;
          left: -100%;
          width: 100%;
          height: 100%;
          background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.2), transparent);
          transition: left 0.5s;
        }

        .menu-button:hover::before {
          left: 100%;
        }

        .menu-button.primary {
          background: linear-gradient(45deg, #ff6b6b, #ee5a24, #ff8a80);
          color: white;
          text-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
          border: 2px solid rgba(255, 255, 255, 0.2);
        }

        .menu-button.secondary {
          background: rgba(255, 255, 255, 0.15);
          color: #ffffff;
          border: 2px solid rgba(255, 255, 255, 0.3);
          backdrop-filter: blur(15px);
        }

        .menu-button:hover {
          transform: translateY(-4px) scale(1.02);
          box-shadow: 0 12px 24px rgba(0, 0, 0, 0.3);
        }

        .menu-button.primary:hover {
          background: linear-gradient(45deg, #ff5252, #d63031, #ff5722);
          box-shadow: 0 12px 24px rgba(255, 107, 107, 0.4);
        }

        .menu-button.secondary:hover {
          background: rgba(255, 255, 255, 0.25);
          border-color: rgba(255, 255, 255, 0.5);
        }

        .button-icon {
          font-size: 1.2rem;
        }

        .button-text {
          flex: 1;
          text-align: left;
        }

        .bottom-icons {
          display: flex;
          justify-content: center;
          gap: 2rem;
          margin-top: auto;
        }

        .bottom-icon {
          width: 50px;
          height: 50px;
          background: rgba(255, 255, 255, 0.15);
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.8rem;
          box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
          transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
          border: 2px solid rgba(255, 255, 255, 0.2);
          backdrop-filter: blur(10px);
        }

        .bottom-icon:hover {
          transform: translateY(-4px) scale(1.1);
          box-shadow: 0 8px 16px rgba(0, 0, 0, 0.3);
          background: rgba(255, 255, 255, 0.25);
          border-color: rgba(255, 255, 255, 0.4);
        }

        /* iPad 최적화 */
        @media (min-width: 768px) and (max-width: 1024px) {
          .game-title {
            font-size: 3rem;
          }
          
          .game-subtitle {
            font-size: 1.4rem;
          }
          
          .menu-button {
            font-size: 1.1rem;
            padding: 1.2rem 1.8rem;
          }
        }

        /* 데스크탑 최적화 */
        @media (min-width: 1025px) {
          .title-background {
            background-size: 60%;
            background-position: center;
          }
          
          .title-background::before {
            background: linear-gradient(135deg, rgba(102, 126, 234, 0.05) 0%, rgba(118, 75, 162, 0.05) 100%);
          }
          
          .game-title {
            font-size: 4rem;
          }
          
          .game-subtitle {
            font-size: 1.6rem;
          }
          
          .menu-button {
            font-size: 1.2rem;
            padding: 1.4rem 2.2rem;
          }
        }

        /* 모바일 최적화 */
        @media (max-width: 767px) {
          .menu-section {
            padding: 1rem;
            max-width: 90%;
          }
          
          .game-title {
            font-size: 2rem;
          }
          
          .game-subtitle {
            font-size: 1rem;
          }
          
          .menu-button {
            font-size: 0.9rem;
            padding: 0.8rem 1rem;
          }
          
          .menu-row {
            flex-direction: column;
            gap: 0.5rem;
          }
        }
      `}</style>
    </>
  );
};

export default TitleScreen;
