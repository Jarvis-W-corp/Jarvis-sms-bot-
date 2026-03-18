# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Quick Reference

```bash
npm start          # Run the bot (node index.js)
npm run setup-db   # Initialize Supabase tables
```

No build step, no tests, no linter. The app runs directly via Node.js (CommonJS).

## Architecture

Super Jarvis v2.0 is a multi-tenant AI assistant that communicates via Discord, SMS, and email. It uses Claude Sonnet for conversation, OpenAI for vector embeddings, and Supabase (PostgreSQL + pgvector) for persistence.

### Core Flow

```
User Message → Channel Adapter (Discord/SMS) → brain.chat() → Claude API → Response
                                                  ↕
                                           memory.recallMemories()
                                           memory.learnFromConversation()
```

### Key Modules

- **index.js** — Express server, initializes Discord + SMS + scheduler. 10-second delay before starting background jobs.
- **src/core/brain.js** — Central AI engine. `chat()` handles all conversations, auto-triggers web search on knowledge gaps. Uses `claude-sonnet-4-20250514`.
- **src/core/memory.js** — Vector embedding system (OpenAI ada-002). Stores facts/decisions/tasks with importance scores. Auto-learns from conversations every 10 messages.
- **src/core/search.js** — Brave Search API integration. Auto-triggered when brain detects "don't know" / "not sure" patterns.
- **src/core/tenant.js** — Multi-tenant resolution with 5-minute cache. Maps Discord IDs to tenants, falls back to default.
- **src/core/gmail.js** — Gmail API via OAuth2. Credentials come from env vars (GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN).
- **src/core/enerflo.js** — Solar CRM integration with auto-refreshing OAuth tokens (2-hour expiry).
- **src/channels/discord.js** — Discord bot with `!` command prefix. Commands handled in `handleCommand()` switch statement. Errors in commands are caught separately so they don't fall through to the AI brain.
- **src/channels/sms.js** — Twilio webhook at POST `/sms`.
- **src/db/queries.js** — All Supabase queries. Tables: `tenants`, `users`, `conversations`, `memories`. Vector search via `match_memories` RPC.
- **src/jobs/scheduler.js** — Background jobs: daily briefing (9 AM), ideas engine (8h), app monitor (5m).

### Discord Command Pattern

Commands use `!` prefix, routed through `handleCommand()` in discord.js. The command call is wrapped in try/catch — if a command throws, it reports the error to the user instead of falling through to `brain.chat()`. To add a new command, add a case to the switch statement and update `!help`.

### Memory System

Memories have categories (fact, decision, task, summary, conversation, training) and importance scores (1-10). `recallMemories()` always includes permanent facts + open tasks + recent decisions, then augments with vector similarity search (threshold 0.7).

### Multi-Tenant

Every query takes a `tenantId`. Tenant resolution: Discord user ID → `tenants` table lookup → cache (5 min TTL) → fallback to default tenant. Boss detection via `tenant.config.boss_discord_id`.

## Environment Variables

API keys: ANTHROPIC_API_KEY, OPENAI_API_KEY, BRAVE_SEARCH_API_KEY
Auth: DISCORD_BOT_TOKEN, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER
Database: SUPABASE_URL, SUPABASE_KEY
Gmail: GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN
Business: ENERFLO_EMAIL, ENERFLO_PASSWORD
Infra: PORT (default 3000), RENDER_EXTERNAL_URL

## Deployment

Hosted on Render. Pushes to `main` trigger auto-deploy. The bot auto-restarts on Discord login failure via `process.exit(1)`. App monitor pings RENDER_EXTERNAL_URL every 5 minutes to keep it alive.

## Known Issues

- Discord token invalidation is a recurring stability problem
- Enerflo API endpoints return 0 data (incomplete integration)
- `gmail-auth.js` is a local-only OAuth helper — not used in production
