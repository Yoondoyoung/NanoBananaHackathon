## Architecture Overview

### Apps
- `frontend/`: React SPA for the visual novel UI, item/achievement UI, and character customization.
- `backend/`: API server for story progression logic, AI orchestration, and secure service calls.
- `supabase/`: Database schema, migrations, RLS, and functions.

### Data Flow
1. User interacts with React app.
2. Frontend calls backend APIs for story state, NPC chat, inventory.
3. Backend uses Supabase (DB, Auth, Realtime, Storage) and AI providers (OpenAI, Gemini).

### AI Integration
- NPC Chat: Backend routes -> OpenAI Chat Completions -> streaming to client.
- Character Visuals: Backend service -> Gemini images (prompted for consistent style) -> stored via Supabase Storage.

### Realtime
- Supabase Realtime channels for episodic events and classroom-like presence.

### Security
- Auth via Supabase; backend verifies JWT on protected routes.
- RLS policies restrict per-user data access.
