## Backend (Node.js + TypeScript)

### Structure
- `src/`
  - `app/` — Express app setup, middleware
  - `routes/` — Route modules
  - `controllers/` — Request handlers
  - `services/` — Business logic (AI, story, inventory)
  - `integrations/` — Supabase client, OpenAI, Gemini SDK wrappers
  - `db/` — Data access, repositories
  - `types/` — Shared TS types
  - `utils/` — Helpers, logging
- `tests/` — Unit/integration tests

### Env
Copy `.env.example` to `.env`.
