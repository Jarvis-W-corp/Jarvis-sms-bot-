# JARVIS MASTER CONTEXT FILE
**Paste this at the start of any new chat to pick up exactly where we left off.**

---

## WHO YOU'RE TALKING TO
- **Mark Palmiero** — solar sales rep in Connecticut, entrepreneur
- Building "Super Jarvis v2.0" — an AI-powered Discord bot he plans to sell to businesses
- Discord user ID: `1245879632692248588` (this is "the boss")
- GitHub org: `Jarvis-W-corp`
- Mac Mini hostname: `Jarviss-Mac-mini` | Tailscale IP: `100.99.236.79`
- SSH: `ssh jarviswilliams@100.99.236.79`
- Project folder: `~/ai-bot`
- Deployed on **Render** (Starter/Team tier — NOT free)
- Render auto-deploys on every `git push origin main`

---

## MARK'S COMMUNICATION STYLE
- Fastest/simplest path always. Don't over-explain.
- Build it right the first time — money is not an issue, he'd rather pay once than redo
- He likes step-by-step, concise instructions
- He uses a Windows keyboard on a Mac (Windows key = Cmd)
- He cannot send unlimited screenshots (chat length limits hit)

---

## LONG-TERM VISION
Jarvis is NOT just a personal bot. It's a **sellable multi-tenant AI workforce platform.**

**Phase 1 (current): Give Jarvis Arms**
Build Jarvis into an autonomous employee who can do tasks himself — not just answer questions.

**Phase 2 (after autonomy is solid):**
1. Mom & pop shop product — takes calls, books appointments, answers FAQs (~$200-500/mo per client)
2. Fitness app (built w/ Brandon, competes with MyFitnessPal) — scrape competitors, run ads
3. Solar daily reports — pipeline from Enerflo CRM, permit tracking, installs
4. Self-learning — Jarvis sends Mark business ideas proactively
5. Trading module — friends will teach Jarvis day trading on calls + playbook

**Ultimate goal:** One codebase, one database, infinite clients. Each client = a tenant ID. Jarvis grows autonomously, eventually improves his own code.

---

## COMPLETED SPRINTS

### ✅ Foundation (Done)
- Node.js bot, Anthropic API (claude-sonnet-4-20250514)
- Supabase PostgreSQL + pgvector database
- Vector memory system (OpenAI text-embedding-ada-002)
- Multi-tenant architecture
- Discord bot with commands: `!stats`, `!memory`, `!users`, `!forget`, `!remember`, `!teach`, `!idea`, `!briefing`, `!solar`, `!help`, `!search`
- SMS via Twilio
- Scheduled jobs: 9am daily briefing, idea generation every 8hrs, app monitoring
- Custom system prompt (proactive, casual, direct — "smart friend" personality)
- Deployed to Render 24/7
- VS Code Remote SSH set up from laptop
- GitHub push working with saved credentials
- Tailscale + SSH remote access working
- Brave Search API integrated (`!search` command)
- Auto-search in brain.js (Jarvis searches automatically when he doesn't know something)
- Discord auto-restart on login failure (process.exit(1) if login fails → Render restarts)

### ✅ Sprint 1: Web Access (Done)
- Brave Search API key in Render env: `BRAVE_SEARCH_API_KEY`
- `src/core/search.js` created — `searchWeb()` and `searchAndSummarize()`
- `!search` command in discord.js
- Auto-search in brain.js: checks if reply contains uncertainty phrases → triggers search

### ✅ Sprint 2: Auto-Search (Done)
- brain.js line 34: detects uncertainty in response → calls `searchAndSummarize()`
- Jarvis searches without user typing `!search`

---

## CURRENT STATUS / WHAT'S NEXT

### 🔲 Immediate Backlog (BACKLOG.md in repo)
- **Enerflo API endpoints** — login works, returns 0 data. Need F12 Network tab screenshot while on Enerflo leads page to find correct endpoints
- `!help` command — add `!search` to the help menu
- SSH auto-start — add Tailscale to Login Items so it auto-connects on Mac Mini boot
- Git identity — run: `git config --global user.name "Jarvis Williams"` and `git config --global user.email "jarviswilliams6211@gmail.com"`
- Clean old files — delete `index.backup.js`, `index.old.backup.js`, `jarvis_memory.json`
- **Fix Discord token invalidation** — root cause unknown, investigate OAuth2

### 🔲 Sprint 3: Hands (Email, Calendar, Enerflo)
- Gmail API partially set up (OAuth credentials downloaded, token saved at `~/ai-bot/gmail-token.json`)
- `src/core/gmail.js` created with `getAuthUrl`, `setAuthCode`, `getEmails`, `sendEmail`
- `googleapis` npm package installed
- Gmail credentials at `~/ai-bot/gmail-credentials.json`
- **Status: OAuth authorized, needs testing with `!gmail` Discord command (not yet wired)**

### 🔲 Sprint 4: Voice
- ElevenLabs voice memos
- Twilio Voice (calls)
- Transcription → stored in memory

### 🔲 Sprint 5: Autonomous
- Proactive alerts (Jarvis monitors topics, DMs Mark)
- Self-improvement (Jarvis writes code → Mark approves → deploys)
- Task queue

### 🔲 Sprint 6: Products
- Mom & pop version
- Solar daily reports (Enerflo)
- Fitness app integration
- Trading module

### 🔲 Sprint 7: Sellable
- Client dashboard (web UI)
- Onboarding flow
- Stripe billing
- White label

---

## PROJECT FILE STRUCTURE
```
~/ai-bot/
├── index.js                  ← main entry point
├── src/
│   ├── core/
│   │   ├── brain.js          ← Claude API, system prompt, auto-search
│   │   ├── memory.js         ← vector embeddings, store/recall/learn
│   │   ├── tenant.js         ← multi-tenant resolution
│   │   ├── search.js         ← Brave Search API
│   │   ├── enerflo.js        ← Enerflo CRM (login works, endpoints TBD)
│   │   └── gmail.js          ← Gmail API (OAuth set up, needs !gmail command)
│   ├── channels/
│   │   ├── discord.js        ← Discord bot + all commands
│   │   └── sms.js            ← Twilio SMS handler
│   ├── db/
│   │   ├── supabase.js       ← Supabase client
│   │   ├── queries.js        ← all DB queries
│   │   └── schema.sql        ← DB schema (already run)
│   └── jobs/
│       └── scheduler.js      ← briefings, ideas, monitoring
├── .env                      ← local env vars (NOT on GitHub)
├── gmail-credentials.json    ← Google OAuth credentials
├── gmail-token.json          ← Gmail access token
└── BACKLOG.md                ← running list of small fixes
```

---

## ENVIRONMENT VARIABLES
**In Render AND in `~/ai-bot/.env`:**
```
ANTHROPIC_API_KEY=...
DISCORD_BOT_TOKEN=...
SUPABASE_URL=https://ioenuajkpwregmadqmbd.supabase.co
SUPABASE_KEY=...
OPENAI_API_KEY=...
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_PHONE_NUMBER=...
BRAVE_SEARCH_API_KEY=...
ENERFLO_EMAIL=...
ENERFLO_PASSWORD=...
```

---

## DATABASE (Supabase)
**Tables:** `tenants`, `memories`, `conversations`, `users`, `scheduled_jobs`
**Mark's tenant:** plan = `owner`, boss_discord_id = `1245879632692248588`
**Vector function:** `match_memories()` for similarity search
**Embeddings model:** `text-embedding-ada-002` (OpenAI)

---

## KNOWN ISSUES & FIXES
- **Discord token invalidation** — happens repeatedly. Temp fix: reset token in Discord dev portal → update in Render env → manual deploy. Permanent fix TBD (investigate OAuth2).
- **Discord silent failure** — fixed with `process.exit(1)` on login failure so Render auto-restarts
- **Claude API crash** — fixed: `response?.content?.[0]?.text || 'Error generating response.'` in brain.js (all 3 spots)
- **Conversation loop** — fix: `DELETE FROM conversations;` in Supabase SQL editor
- **Supabase URL typo** — correct URL is `ioenuajkpwregmadqmbd.supabase.co` (has 'a' not 's')

---

## STANDARD DEPLOY COMMAND
```bash
cd ~/ai-bot
git add -A && git commit -m "description" && git push origin main
```

## STANDARD SSH COMMAND
```bash
ssh jarviswilliams@100.99.236.79
```

---

## FRANK (COMPETITOR INTEL)
Mark's employer built an internal bot called Frank (frank@goisp.com). It:
- Runs on a Mac Mini via Cloudflare Tunnel
- Reads/sends emails automatically
- Manages a kiosk lead program (SOKI)
- Has Enerflo webhook integration (real-time prospect.updated events)
- Uses Anthropic API (Claude)
- Has a dashboard at goisp.com

**Key insight:** Frank is one company's internal tool. Jarvis is being built as a platform to sell to any business. Jarvis architecture is already more scalable.
