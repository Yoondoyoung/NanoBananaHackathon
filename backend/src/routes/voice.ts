import express from 'express';
import multer from 'multer';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { GoogleGenAI } from '@google/genai';
import { createClient } from '@supabase/supabase-js';
import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

const router = express.Router();

// Initialize AI services
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
const googleGenAI = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY!,
});

// Initialize Supabase client (using same project as MCP)
const supabaseUrl = process.env.SUPABASE_URL || 'https://wvmkurseomwhrzamqadk.supabase.co';
const supabaseKey = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind2bWt1cnNlb213aHJ6YW1xYWRrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTcxNzAxODAsImV4cCI6MjA3Mjc0NjE4MH0.W3oX-EDz_ZHhm2qQr8xucgf_Kj7wOISR8CbhH6sGhIY';

console.log('Supabase URL:', supabaseUrl);
console.log('Supabase Key (first 20 chars):', supabaseKey.substring(0, 20) + '...');
console.log('Environment variables:');
console.log('SUPABASE_URL:', process.env.SUPABASE_URL);
console.log('SUPABASE_ANON_KEY:', process.env.SUPABASE_ANON_KEY ? 'SET' : 'NOT SET');

const supabase = createClient(supabaseUrl, supabaseKey);

// Initialize ElevenLabs client
const elevenlabs = new ElevenLabsClient({
  apiKey: process.env.ELEVEN_LABS_KEY || '57a9ca943d59213e3312e0e0dfd14c6a183baf3bda3293c70852c8a32fb23e20'
});

// Configure multer for audio file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
});

// Character creation conversation flow
const conversationFlow = {
  name: {
    prompt: "안녕하세요! 저는 여러분의 캐릭터를 만들어드릴 특별한 도우미입니다. 먼저 이름을 알려주세요!",
    followUp: "멋진 이름이네요! 이제 어떤 종류의 영웅이 되고 싶으신가요? 예를 들어, 마법사, 기사, 탐험가, 과학자 등이 있어요."
  },
  heroType: {
    prompt: "훌륭한 선택입니다! 마지막으로 외모는 어떻게 하고 싶으신가요? 머리 색깔, 옷 스타일, 특별한 특징 등을 말씀해주세요.",
    followUp: "완벽해요! 이제 여러분의 캐릭터를 만들어보겠습니다."
  },
  appearance: {
    prompt: "모든 정보를 받았습니다! 잠시만 기다려주세요.",
    followUp: "🎉 캐릭터가 완성되었습니다! 이제 함께 모험을 떠나볼까요?"
  }
};

// POST /api/voice-input - Main voice processing endpoint
router.post('/voice-input', upload.single('audio'), async (req, res) => {
  try {
    const { action, text, step, field, characterData } = req.body;

    // Handle TTS requests (ElevenLabs only)
    if (action === 'tts') {
      const audioBuffer = await generateNarration(text);
      
      // Base64로 인코딩해서 JSON으로 반환
      const base64Audio = audioBuffer.toString('base64');
      res.json({
        success: true,
        audioData: base64Audio,
        contentType: 'audio/mpeg'
      });
      return;
    }

    // Handle ElevenLabs narration requests
    if (action === 'narration') {
      const { text, voiceId } = req.body;
      const audioBuffer = await generateNarration(text, voiceId);
      res.set({
        'Content-Type': 'audio/mpeg',
        'Content-Length': audioBuffer.length.toString()
      });
      res.send(audioBuffer);
      return;
    }

    // Handle game welcome narration
    if (action === 'welcome_narration') {
      console.log('Welcome narration requested');
      const welcomeText = `안녕하세요! 환영합니다! 저는 여러분의 학습 모험을 도와드릴 특별한 친구입니다. 오늘은 어떤 재미있는 이야기를 함께 만들어볼까요? 먼저 여러분만의 특별한 캐릭터를 만들어보세요!`;
      const audioBuffer = await generateNarration(welcomeText, 'jBpfuIE2acCO8z3wKNLl'); // Use cache if available
      
      console.log('Audio buffer generated, size:', audioBuffer.length);
      
      res.set({
        'Content-Type': 'audio/mpeg',
        'Content-Length': audioBuffer.length.toString()
      });
      res.send(audioBuffer);
      return;
    }

    // Handle character generation
    if (action === 'generate_character') {
      const result = await generateCharacter(JSON.parse(characterData));
      res.json(result);
      return;
    }

    // Handle character retrieval
    if (action === 'get_characters') {
      const { userId } = req.body;
      const { data: characters, error } = await supabase
        .from('characters')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) {
        return res.status(500).json({ 
          success: false, 
          error: 'Failed to fetch characters' 
        });
      }

      res.json({
        success: true,
        characters: characters || []
      });
      return;
    }

    // Handle items retrieval
    if (action === 'get_items') {
      const { category } = req.body;
      let query = supabase
        .from('items')
        .select('*')
        .order('category', { ascending: true });

      if (category) {
        query = query.eq('category', category);
      }

      const { data: items, error } = await query;

      if (error) {
        return res.status(500).json({ 
          success: false, 
          error: 'Failed to fetch items' 
        });
      }

      res.json({
        success: true,
        items: items || []
      });
      return;
    }

    // Handle character items (inventory)
    if (action === 'get_character_items') {
      const { characterId } = req.body;
      const { data: characterItems, error } = await supabase
        .from('character_items')
        .select(`
          *,
          items (*)
        `)
        .eq('character_id', characterId);

      if (error) {
        return res.status(500).json({ 
          success: false, 
          error: 'Failed to fetch character items' 
        });
      }

      res.json({
        success: true,
        characterItems: characterItems || []
      });
      return;
    }

    // Handle equip/unequip items
    if (action === 'equip_item') {
      const { characterId, itemId, equip } = req.body;
      
      // First, unequip any item in the same category
      if (equip) {
        const { data: item } = await supabase
          .from('items')
          .select('category')
          .eq('id', itemId)
          .single();

        if (item) {
          // Unequip other items in the same category
          const { data: categoryItems } = await supabase
            .from('items')
            .select('id')
            .eq('category', item.category);
          
          if (categoryItems && categoryItems.length > 0) {
            const categoryItemIds = categoryItems.map(i => i.id);
            await supabase
              .from('character_items')
              .update({ is_equipped: false })
              .eq('character_id', characterId)
              .in('item_id', categoryItemIds);
          }
        }
      }

      // Update the specific item
      const { data, error } = await supabase
        .from('character_items')
        .update({ 
          is_equipped: equip,
          equipped_at: equip ? new Date().toISOString() : null
        })
        .eq('character_id', characterId)
        .eq('item_id', itemId)
        .select();

      if (error) {
        return res.status(500).json({ 
          success: false, 
          error: 'Failed to equip/unequip item' 
        });
      }

      res.json({
        success: true,
        characterItem: data?.[0] || null
      });
      return;
    }

    // Handle add item to character
    if (action === 'add_item_to_character') {
      const { characterId, itemId } = req.body;
      
      const { data, error } = await supabase
        .from('character_items')
        .insert({
          character_id: characterId,
          item_id: itemId,
          is_equipped: false
        })
        .select(`
          *,
          items (*)
        `)
        .single();

      if (error) {
        return res.status(500).json({ 
          success: false, 
          error: 'Failed to add item to character' 
        });
      }

      res.json({
        success: true,
        characterItem: data
      });
      return;
    }

    // Handle generate character with items
    if (action === 'generate_character_with_items') {
      const { characterId } = req.body;
      
      // Get character and their equipped items
      const { data: character, error: charError } = await supabase
        .from('characters')
        .select('*')
        .eq('id', characterId)
        .single();

      if (charError || !character) {
        return res.status(404).json({ 
          success: false, 
          error: 'Character not found' 
        });
      }

      const { data: equippedItems, error: itemsError } = await supabase
        .from('character_items')
        .select(`
          *,
          items (*)
        `)
        .eq('character_id', characterId)
        .eq('is_equipped', true);

      if (itemsError) {
        return res.status(500).json({ 
          success: false, 
          error: 'Failed to fetch equipped items' 
        });
      }

      // Generate new character image with items
      const result = await generateCharacterWithItems(character, equippedItems || []);
      res.json(result);
      return;
    }

    // Handle get cached narrations
    if (action === 'get_narrations') {
      const { limit = 50 } = req.body;
      const { data: narrations, error } = await supabase
        .from('narrations')
        .select('id, text_content, voice_id, file_size, created_at')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        return res.status(500).json({ 
          success: false, 
          error: 'Failed to fetch narrations' 
        });
      }

      res.json({
        success: true,
        narrations: narrations || []
      });
      return;
    }

    // Handle delete narration
    if (action === 'delete_narration') {
      const { narrationId } = req.body;
      const { error } = await supabase
        .from('narrations')
        .delete()
        .eq('id', narrationId);

      if (error) {
        return res.status(500).json({ 
          success: false, 
          error: 'Failed to delete narration' 
        });
      }

      res.json({
        success: true,
        message: 'Narration deleted successfully'
      });
      return;
    }

    // Handle audio transcription
    if (!req.file) {
      return res.status(400).json({ 
        success: false, 
        error: 'No audio file provided' 
      });
    }

    const transcription = await transcribeAudio(req.file.buffer);
    
    if (!transcription) {
      return res.json({ 
        success: false, 
        error: 'Could not transcribe audio' 
      });
    }

    // Generate appropriate response based on conversation step
    const responseText = generateConversationResponse(parseInt(step), field, transcription);
    const audioResponse = await generateNarration(responseText);

    res.json({
      success: true,
      transcription,
      responseText,
      audioResponse: audioResponse.toString('base64')
    });

  } catch (error) {
    console.error('Voice processing error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error' 
    });
  }
});

// Transcribe audio using OpenAI Whisper
async function transcribeAudio(audioBuffer: Buffer): Promise<string | null> {
  try {
    // Create a temporary file for the audio
    const tempFilePath = path.join(__dirname, '../../temp', `audio_${Date.now()}.wav`);
    
    // Ensure temp directory exists
    const tempDir = path.dirname(tempFilePath);
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    fs.writeFileSync(tempFilePath, audioBuffer);

    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(tempFilePath),
      model: "whisper-1",
      language: "ko", // Korean language
    });

    // Clean up temporary file
    fs.unlinkSync(tempFilePath);

    return transcription.text;
  } catch (error) {
    console.error('Transcription error:', error);
    return null;
  }
}

// Generate TTS using ElevenLabs only
async function generateTTS(text: string): Promise<Buffer> {
  return await generateNarration(text);
}

// Generate text hash for caching
function generateTextHash(text: string, voiceId: string): string {
  return crypto.createHash('sha256').update(`${text}:${voiceId}`).digest('hex');
}

// Force regenerate narration (bypass cache)
async function forceRegenerateNarration(text: string, voiceId: string = 'jBpfuIE2acCO8z3wKNLl'): Promise<Buffer> {
  try {
    console.log('Force regenerating narration with ElevenLabs...');
    
    const audio = await elevenlabs.textToSpeech.convert(voiceId, {
      text: text,
      modelId: 'eleven_multilingual_v2',
      outputFormat: 'mp3_44100_128'
    });

    const chunks: Buffer[] = [];
    for await (const chunk of audio) {
      chunks.push(Buffer.from(chunk));
    }
    
    const audioBuffer = Buffer.concat(chunks);
    
    // Save to cache for future use
    await saveNarrationToCache(text, voiceId, audioBuffer);
    
    console.log('ElevenLabs narration force regenerated and cached successfully');
    return audioBuffer;
  } catch (error) {
    console.error('ElevenLabs narration generation error:', error);
    throw error;
  }
}

// Get cached narration from database
async function getCachedNarration(text: string, voiceId: string): Promise<Buffer | null> {
  try {
    const textHash = generateTextHash(text, voiceId);
    
    console.log('Looking for cached narration with hash:', textHash);
    
    const { data: narration, error } = await supabase
      .from('narrations')
      .select('audio_data')
      .eq('text_hash', textHash)
      .single();

    if (error) {
      console.log('No cached narration found:', error.message);
      return null;
    }

    if (!narration || !narration.audio_data) {
      console.log('No cached narration found: no data');
      return null;
    }

    console.log('Found cached narration audio data, size:', narration.audio_data.length);
    console.log('First 20 bytes of cached audio:', narration.audio_data.slice(0, 20).toString('hex'));
    return Buffer.from(narration.audio_data);
  } catch (error) {
    console.error('Error getting cached narration:', error);
    return null;
  }
}

// Save narration audio data to database cache
async function saveNarrationToCache(text: string, voiceId: string, audioBuffer: Buffer): Promise<void> {
  try {
    console.log('Attempting to save narration audio data to cache...');
    console.log('Text length:', text.length);
    console.log('Voice ID:', voiceId);
    console.log('Audio buffer size:', audioBuffer.length);
    
    const textHash = generateTextHash(text, voiceId);
    console.log('Generated text hash:', textHash);
    
    // Test Supabase connection first
    const { data: testData, error: testError } = await supabase
      .from('narrations')
      .select('id')
      .limit(1);
    
    if (testError) {
      console.error('Supabase connection test failed:', testError);
      return;
    }
    console.log('Supabase connection test successful');
    
    const { error } = await supabase
      .from('narrations')
      .upsert({
        text_hash: textHash,
        text_content: text,
        voice_id: voiceId,
        audio_data: audioBuffer,
        file_size: audioBuffer.length,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'text_hash'
      });

    if (error) {
      console.error('Error saving narration audio data to cache:', error);
      console.error('Error details:', JSON.stringify(error, null, 2));
      console.error('Error code:', error.code);
      console.error('Error message:', error.message);
    } else {
      console.log('Narration audio data saved to cache successfully');
    }
  } catch (error) {
    console.error('Error saving narration audio data to cache:', error);
    if (error instanceof Error) {
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
    }
  }
}


// Generate narration using ElevenLabs with caching
async function generateNarration(text: string, voiceId: string = 'EXAVITQu4vr4xnSDxMaL'): Promise<Buffer> {
  try {
    // First, try to get from cache
    const cachedAudio = await getCachedNarration(text, voiceId);
    if (cachedAudio) {
      console.log('Using cached narration audio data');
      return cachedAudio;
    }

    console.log('Generating new narration with ElevenLabs...');
    
    let audio;
    try {
      audio = await elevenlabs.textToSpeech.convert(voiceId, {
        text: text,
        modelId: 'eleven_monolingual_v1', // English optimized
        outputFormat: 'mp3_44100_128'
      });
      console.log('ElevenLabs API call successful');
      console.log('Audio response type:', typeof audio);
      console.log('Audio response constructor:', audio?.constructor?.name);
    } catch (elevenLabsError) {
      console.error('ElevenLabs API error:', elevenLabsError);
      throw elevenLabsError;
    }

    // Convert the audio stream to buffer
    const chunks: Buffer[] = [];
    for await (const chunk of audio) {
      chunks.push(Buffer.from(chunk));
    }
    
    const audioBuffer = Buffer.concat(chunks);
    
    console.log('ElevenLabs audio generated:', {
      chunks: chunks.length,
      totalSize: audioBuffer.length,
      firstBytes: audioBuffer.slice(0, 10).toString('hex')
    });
    
    // Save audio data to database cache
    await saveNarrationToCache(text, voiceId, audioBuffer);
    
    // 디버깅을 위해 파일로도 저장
    const debugFileName = `debug_narration_${Date.now()}.mp3`;
    const debugFilePath = path.join(__dirname, '..', '..', 'temp', debugFileName);
    
    // 디렉토리가 없으면 생성
    const debugDir = path.dirname(debugFilePath);
    if (!fs.existsSync(debugDir)) {
      fs.mkdirSync(debugDir, { recursive: true });
    }
    
    fs.writeFileSync(debugFilePath, audioBuffer);
    console.log('Debug file saved:', debugFilePath);
    
    console.log('ElevenLabs narration generated and saved to database');
    return audioBuffer;
  } catch (error) {
    console.error('ElevenLabs narration generation error:', error);
    if (error instanceof Error) {
      console.error('Error details:', error.message);
    }
    throw error;
  }
}

// Generate conversation response based on step and user input
function generateConversationResponse(step: number, field: string, userInput: string): string {
  const responses = {
    0: `좋은 이름이네요! "${userInput}"라고 하시는군요. 이제 어떤 종류의 영웅이 되고 싶으신가요? 예를 들어, 마법사, 기사, 탐험가, 과학자 등이 있어요.`,
    1: `훌륭한 선택입니다! "${userInput}" 영웅이군요. 마지막으로 외모는 어떻게 하고 싶으신가요? 머리 색깔, 옷 스타일, 특별한 특징 등을 말씀해주세요.`,
    2: `완벽해요! "${userInput}"라는 외모로 설정하겠습니다. 이제 여러분의 캐릭터를 만들어보겠습니다. 잠시만 기다려주세요!`
  };

  return responses[step as keyof typeof responses] || "이해하지 못했습니다. 다시 말씀해주세요.";
}

// Generate character image using Gemini 2.5 Flash Preview
async function generateCharacter(characterData: any, userId?: string) {
  try {
    const { name, heroType, appearance } = characterData;
    
    // Create a detailed prompt for character generation
    const prompt = `Create a comprehensive character reference sheet for an educational visual novel game. 
    Character details:
    - Name: ${name}
    - Type: ${heroType}
    - Appearance: ${appearance}
    
    Reference sheet requirements:
    - Multiple character poses and angles (front view, side view, back view, 3/4 view)
    - Various expressions (happy, thinking, surprised, determined)
    - Different body positions (standing, sitting, pointing, hands on hips)
    - Character details close-ups (face, hands, accessories, clothing details)
    - Color palette and design elements
    - Consistent character design across all views
    
    Art style requirements:
    - Cartoon/anime style with exaggerated, non-realistic proportions
    - Large head, expressive facial features, and warm body proportions
    - Clean, confident line art with varying weights
    - Soft, watercolor-like shading and textures
    - Muted, earthy color palette with gentle contrasts
    - Whimsical and approachable character design
    - Professional character concept art sheet layout
    - High quality, detailed illustrations suitable for game development reference
    
    Layout: Arrange multiple character views and expressions in a clean, organized reference sheet format similar to professional character concept art sheets used in animation and game development.`;

    const imageUrl = await generateCharacterImageWithGemini(prompt);
    
    // Save character to Supabase database
    const characterRecord = {
      user_id: userId || null,
      name,
      hero_type: heroType,
      appearance,
      image_url: imageUrl,
      character_data: characterData
    };

    const { data: savedCharacter, error: dbError } = await supabase
      .from('characters')
      .insert(characterRecord)
      .select()
      .single();

    if (dbError) {
      console.error('Database save error:', dbError);
      // Continue even if database save fails
    }
    
    const finalMessage = `🎉 ${name} 캐릭터가 완성되었습니다! ${heroType}로서 ${appearance}의 모습으로 태어났어요. 이제 함께 재미있는 학습 모험을 떠나볼까요?`;

    return {
      success: true,
      imageUrl,
      finalMessage,
      characterData,
      characterId: savedCharacter?.id || null
    };

  } catch (error) {
    console.error('Character generation error:', error);
    return {
      success: false,
      error: 'Failed to generate character'
    };
  }
}

// Generate character image using Gemini 2.5 Flash Preview
async function generateCharacterImageWithGemini(prompt: string): Promise<string> {
  try {
    console.log('Generating character image with Gemini 2.5 Flash Image...');
    
    // Use the correct Gemini 2.5 Flash Image API
    const response = await googleGenAI.models.generateContent({
      model: "gemini-2.5-flash-image-preview",
      contents: prompt,
    });
    
    // Process the response to extract image data
    if (response.candidates && response.candidates[0] && response.candidates[0].content) {
      const content = response.candidates[0].content;
      
      if (content.parts) {
        for (const part of content.parts) {
          if (part.text) {
            console.log('Text response:', part.text);
          } else if (part.inlineData) {
            const imageData = part.inlineData.data;
            console.log('Image data received, converting to data URL...');
            
            // Convert base64 to data URL
            return `data:${part.inlineData.mimeType || 'image/png'};base64,${imageData}`;
          }
        }
      }
    }
    
    console.log('No image data found in response');
    throw new Error('No image data received from Gemini');
    
  } catch (error) {
    console.error('Gemini 2.5 Flash Image generation error:', error);
    throw error;
  }
}

// Generate character image with equipped items
async function generateCharacterWithItems(character: any, equippedItems: any[]) {
  try {
    const { name, hero_type, appearance, character_data } = character;
    
    // Build item description from equipped items
    const itemDescriptions = equippedItems.map(ci => {
      const item = ci.items;
      return `${item.category}: ${item.name} (${item.description})`;
    }).join(', ');

    const itemsText = itemDescriptions ? `\nEquipped items: ${itemDescriptions}` : '';
    
    // Create a detailed prompt for character generation with items
    const prompt = `Create a comprehensive character reference sheet for an educational visual novel game. 
    Character details:
    - Name: ${name}
    - Type: ${hero_type}
    - Base Appearance: ${appearance}${itemsText}
    
    Reference sheet requirements:
    - Multiple character poses and angles (front view, side view, back view, 3/4 view)
    - Various expressions (happy, thinking, surprised, determined)
    - Different body positions (standing, sitting, pointing, hands on hips)
    - Character details close-ups (face, hands, accessories, clothing details)
    - Color palette and design elements
    - Consistent character design across all views
    - All equipped items should be clearly visible and properly integrated
    
    Art style requirements:
    - Cartoon/anime style with exaggerated, non-realistic proportions
    - Large head, expressive facial features, and warm body proportions
    - Clean, confident line art with varying weights
    - Soft, watercolor-like shading and textures
    - Muted, earthy color palette with gentle contrasts
    - Whimsical and approachable character design
    - Professional character concept art sheet layout
    - High quality, detailed illustrations suitable for game development reference
    
    Layout: Arrange multiple character views and expressions in a clean, organized reference sheet format similar to professional character concept art sheets used in animation and game development. Make sure all equipped items are clearly visible and properly integrated into the character design.`;

    const imageUrl = await generateCharacterImageWithGemini(prompt);
    
    // Update character with new image
    const { data: updatedCharacter, error: updateError } = await supabase
      .from('characters')
      .update({ 
        image_url: imageUrl,
        updated_at: new Date().toISOString()
      })
      .eq('id', character.id)
      .select()
      .single();

    if (updateError) {
      console.error('Failed to update character image:', updateError);
    }
    
    const finalMessage = `🎉 ${name} 캐릭터가 새로운 아이템과 함께 업데이트되었습니다!`;

    return {
      success: true,
      imageUrl,
      finalMessage,
      character: updatedCharacter || character,
      equippedItems
    };

  } catch (error) {
    console.error('Character with items generation error:', error);
    return {
      success: false,
      error: 'Failed to generate character with items'
    };
  }
}

export default router;
