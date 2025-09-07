-- Create items table for character customization
CREATE TABLE IF NOT EXISTS items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL, -- 'hat', 'shirt', 'pants', 'shoes', 'accessory', 'weapon', etc.
  rarity TEXT DEFAULT 'common', -- 'common', 'rare', 'epic', 'legendary'
  image_url TEXT,
  item_data JSONB, -- Additional item properties
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create character_items table for many-to-many relationship
CREATE TABLE IF NOT EXISTS character_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  character_id UUID REFERENCES characters(id) ON DELETE CASCADE,
  item_id UUID REFERENCES items(id) ON DELETE CASCADE,
  is_equipped BOOLEAN DEFAULT false,
  equipped_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(character_id, item_id)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_items_category ON items(category);
CREATE INDEX IF NOT EXISTS idx_items_rarity ON items(rarity);
CREATE INDEX IF NOT EXISTS idx_character_items_character_id ON character_items(character_id);
CREATE INDEX IF NOT EXISTS idx_character_items_item_id ON character_items(item_id);
CREATE INDEX IF NOT EXISTS idx_character_items_equipped ON character_items(is_equipped);

-- Enable RLS (Row Level Security)
ALTER TABLE items ENABLE ROW LEVEL SECURITY;
ALTER TABLE character_items ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for items (public read, admin write)
CREATE POLICY "Anyone can view items" ON items
  FOR SELECT USING (true);

CREATE POLICY "Admin can manage items" ON items
  FOR ALL USING (auth.role() = 'service_role');

-- Create RLS policies for character_items
CREATE POLICY "Users can view their character items" ON character_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM characters 
      WHERE characters.id = character_items.character_id 
      AND characters.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage their character items" ON character_items
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM characters 
      WHERE characters.id = character_items.character_id 
      AND characters.user_id = auth.uid()
    )
  );

-- Create updated_at function if it doesn't exist
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create updated_at triggers
CREATE TRIGGER update_items_updated_at 
  BEFORE UPDATE ON items 
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_character_items_updated_at 
  BEFORE UPDATE ON character_items 
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();

-- Insert some default items
INSERT INTO items (name, description, category, rarity, item_data) VALUES
('기본 모자', '간단한 베이스볼 캡', 'hat', 'common', '{"color": "blue", "style": "casual"}'),
('마법사 모자', '뾰족한 끝이 있는 마법사 모자', 'hat', 'rare', '{"color": "purple", "style": "magical", "stars": true}'),
('기사 투구', '빛나는 금속 투구', 'hat', 'epic', '{"color": "silver", "style": "armor", "plume": "red"}'),
('기본 셔츠', '편안한 면 셔츠', 'shirt', 'common', '{"color": "white", "style": "casual"}'),
('마법사 로브', '긴 마법사 로브', 'shirt', 'rare', '{"color": "blue", "style": "magical", "stars": true}'),
('기사 갑옷', '강화된 금속 갑옷', 'shirt', 'epic', '{"color": "silver", "style": "armor", "emblem": "lion"}'),
('기본 바지', '편안한 청바지', 'pants', 'common', '{"color": "blue", "style": "casual"}'),
('마법사 바지', '마법사용 긴 바지', 'pants', 'rare', '{"color": "black", "style": "magical"}'),
('기사 바지', '갑옷과 어울리는 바지', 'pants', 'epic', '{"color": "dark_gray", "style": "armor"}'),
('기본 신발', '편안한 운동화', 'shoes', 'common', '{"color": "white", "style": "casual"}'),
('마법사 부츠', '마법사용 부츠', 'shoes', 'rare', '{"color": "brown", "style": "magical", "buckles": true}'),
('기사 부츠', '강화된 금속 부츠', 'shoes', 'epic', '{"color": "silver", "style": "armor", "spurs": true}'),
('마법 지팡이', '빛나는 마법 지팡이', 'weapon', 'rare', '{"color": "gold", "style": "magical", "crystal": "blue"}'),
('기사 검', '날카로운 기사 검', 'weapon', 'epic', '{"color": "silver", "style": "sword", "hilt": "gold"}'),
('탐험가 배낭', '모험을 위한 배낭', 'accessory', 'common', '{"color": "brown", "style": "adventure", "pockets": 3}'),
('마법 반지', '마법이 깃든 반지', 'accessory', 'rare', '{"color": "gold", "style": "magical", "gem": "ruby"}');
