## NanoBanana Educational Visual Novel Game

An educational web game for children unable to attend school in person. Full-stack monorepo with React frontend, TypeScript backend, and Supabase for auth, database, and realtime.

### Tech Stack
- **Frontend**: React + TypeScript
- **Backend**: Node.js + TypeScript (Express)
- **Database**: Supabase (Postgres, Auth, Realtime, Storage)
- **AI**: OpenAI API (NPC dialogue), Gemini API (character visuals)

### Repository Structure
- `frontend/` — React app
- `backend/` — TypeScript API server
- `supabase/` — Database schema, migrations, policies, seed, functions
- `docs/` — Architecture, API design, and game design notes

### Getting Started
- See `frontend/README.md` and `backend/README.md` for service-specific setup
- See `supabase/README.md` for database schema, migrations, and CLI usage

### Environments
- Create `.env` files from the provided `.env.example` files in each service directory

### High-Level Features
- Customizable character with consistent visuals (Gemini)
- Interactive branching story
- Real-time NPC conversations (OpenAI)
- Items and achievements for motivation
