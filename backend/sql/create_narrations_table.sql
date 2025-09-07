-- Create narrations table for caching TTS audio
CREATE TABLE IF NOT EXISTS narrations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  text_hash TEXT UNIQUE NOT NULL, -- Hash of the text for quick lookup
  text_content TEXT NOT NULL, -- Original text
  voice_id TEXT NOT NULL, -- ElevenLabs voice ID
  audio_url TEXT, -- URL to stored audio file
  audio_data BYTEA, -- Binary audio data (alternative to URL)
  duration_seconds INTEGER, -- Audio duration in seconds
  file_size INTEGER, -- File size in bytes
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_narrations_text_hash ON narrations(text_hash);
CREATE INDEX IF NOT EXISTS idx_narrations_voice_id ON narrations(voice_id);
CREATE INDEX IF NOT EXISTS idx_narrations_created_at ON narrations(created_at);

-- Enable RLS (Row Level Security)
ALTER TABLE narrations ENABLE ROW LEVEL SECURITY;

-- Create RLS policies (public read, admin write)
CREATE POLICY "Anyone can view narrations" ON narrations
  FOR SELECT USING (true);

CREATE POLICY "Admin can manage narrations" ON narrations
  FOR ALL USING (auth.role() = 'service_role');

-- Create updated_at function if it doesn't exist
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create updated_at trigger
CREATE TRIGGER update_narrations_updated_at 
  BEFORE UPDATE ON narrations 
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();

-- Insert some default narrations
INSERT INTO narrations (text_hash, text_content, voice_id, audio_url) VALUES
('welcome_hash', '안녕하세요! 환영합니다! 저는 여러분의 학습 모험을 도와드릴 특별한 친구입니다. 오늘은 어떤 재미있는 이야기를 함께 만들어볼까요? 먼저 여러분만의 특별한 캐릭터를 만들어보세요!', 'jBpfuIE2acCO8z3wKNLl', NULL),
('character_creation_start', '안녕하세요! 저는 여러분의 캐릭터를 만들어드릴 특별한 도우미입니다. 먼저 이름을 알려주세요!', 'jBpfuIE2acCO8z3wKNLl', NULL),
('character_creation_hero', '멋진 이름이네요! 이제 어떤 종류의 영웅이 되고 싶으신가요? 예를 들어, 마법사, 기사, 탐험가, 과학자 등이 있어요.', 'jBpfuIE2acCO8z3wKNLl', NULL),
('character_creation_appearance', '훌륭한 선택입니다! 마지막으로 외모는 어떻게 하고 싶으신가요? 먼리 색깔, 옷 스타일, 특별한 특징 등을 말씀해주세요.', 'jBpfuIE2acCO8z3wKNLl', NULL),
('character_creation_complete', '완벽해요! 이제 여러분의 캐릭터를 만들어보겠습니다. 잠시만 기다려주세요!', 'jBpfuIE2acCO8z3wKNLl', NULL);
