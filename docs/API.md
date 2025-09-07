## API Outline

### Auth
- `POST /auth/callback` — Supabase auth webhook (optional)

### Player
- `GET /players/me` — Get current player profile
- `PATCH /players/me` — Update player settings

### Story
- `GET /story/state` — Get current story node/state
- `POST /story/choice` — Submit a choice and progress

### Chat
- `POST /chat/message` — Send message to NPC (streams response)

### Inventory
- `GET /inventory` — List items
- `POST /inventory/use` — Use/consume an item

### Achievements
- `GET /achievements` — List achievements
