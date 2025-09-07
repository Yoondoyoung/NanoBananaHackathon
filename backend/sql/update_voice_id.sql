-- Update voice ID for all narrations
UPDATE narrations 
SET voice_id = 'jBpfuIE2acCO8z3wKNLl' 
WHERE voice_id = 'JBFqnCBsd6RMkjVDRZzb';

-- Alternative: Delete old narrations and let them regenerate with new voice
-- DELETE FROM narrations WHERE voice_id = 'JBFqnCBsd6RMkjVDRZzb';

-- Check the updated records
SELECT id, text_content, voice_id, created_at 
FROM narrations 
ORDER BY created_at DESC;