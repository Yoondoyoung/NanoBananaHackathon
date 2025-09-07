## Supabase

This directory contains database schema, migrations, Row Level Security (RLS) policies, seed data, and Edge Functions (if used).

### Structure
- `migrations/` — SQL migrations (DDL)
- `seeds/` — Seed SQL/TS scripts for initial data
- `policies/` — RLS policies as SQL
- `functions/` — Edge Functions (Deno)
- `types/` — Generated types for TypeScript

### Getting Started
- Install CLI: `npm i -g supabase`
- Login: `supabase login`
- Start local dev: `supabase start`
- Stop: `supabase stop`

### Migrations
- Create: `supabase migration new init`
- Apply: `supabase db push`

### Types
- Generate: `supabase gen types typescript --project-id <PROJECT_REF> --schema public > types/types.ts`
