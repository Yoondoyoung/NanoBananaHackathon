-- 기본 캐릭터 데이터 삽입
INSERT INTO characters (
  id,
  name,
  hero_type,
  appearance_description,
  image_url,
  created_at,
  updated_at
) VALUES (
  'default-character-001',
  '나노바나나',
  '모험가',
  '친근하고 활발한 모험가. 갈색 머리를 긴 땋은 머리로 하고 있으며, 중세 판타지 스타일의 녹색 튜닉과 갈색 바지를 입고 있습니다. 두루마리를 들고 다니는 지식 탐구자입니다.',
  '/api/character-images/default-character-reference.png',
  NOW(),
  NOW()
) ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  hero_type = EXCLUDED.hero_type,
  appearance_description = EXCLUDED.appearance_description,
  image_url = EXCLUDED.image_url,
  updated_at = NOW();

-- 기본 캐릭터 이미지 정보를 narrations 테이블에도 저장 (나레이션용)
INSERT INTO narrations (
  text_hash,
  text,
  audio_url,
  created_at,
  updated_at
) VALUES (
  'default-character-welcome',
  '안녕하세요! 저는 나노바나나입니다. 여러분의 모험을 도와드릴 특별한 친구예요!',
  '/api/audio/default-character-welcome.mp3',
  NOW(),
  NOW()
) ON CONFLICT (text_hash) DO UPDATE SET
  text = EXCLUDED.text,
  audio_url = EXCLUDED.audio_url,
  updated_at = NOW();
