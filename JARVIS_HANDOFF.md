I'm Mark Palmiero. I run a solar/roofing sales team in CT. I build from my MacBook Pro. Here's the full context for my project — pick up where the last session left off.

## THE VISION

Jarvis is an AI-powered holding company operator — not an assistant, a CEO with AI employees. Jarvis decides what to build, delegates to specialized agents, reviews results, ships, and iterates. Revenue-first — every decision evaluated by "does this make money?"

### Jarvis Employee Agents (sub-agents already built: Hawk, Ghost, Pulse)
- **Marketing Agent** — ad copy, content, social, landing pages
- **Ads Agent** — Meta/Google campaigns, A/B testing, budget optimization
- **Commerce Agent** — Shopify stores, product sourcing, pricing
- **Research Agent** — market scanning, competitor analysis, trend finding
- **Ops Agent** — revenue tracking, P&L, alerts, monitoring
- **Dialer Agent** — AI phone calls, appointment setting (Twilio + ElevenLabs)

### Business Ventures Jarvis Runs
1. **Intake App** (MyFitnessPal competitor) — #1 PRIORITY RIGHT NOW
2. Custom Business Bots (SaaS) — sell AI bots to companies
3. AI Dialer — appointment setting via AI phone calls
4. E-commerce — trending products, Shopify, ads
5. Clothing brands — design, market, sell
6. Trading — stocks/crypto with learned strategies
7. Solar CRM (HC Daily Tracker) — already live at /sales

## WHAT'S ALREADY BUILT

### Jarvis Core (Node.js, Express, CommonJS)
- **Repo:** /Users/jarviswilliams/ai-bot (GitHub: Jarvis-W-corp/Jarvis-sms-bot-)
- **Deploy:** Render, auto-deploys on push to main
- **DB:** Supabase (ioenuajkpwregmadqmbd.supabase.co)
- **Channels:** Discord bot (! prefix), Twilio SMS, Gmail
- **Brain:** Claude Sonnet via Anthropic API + vector memory (OpenAI ada-002 embeddings)
- **Modules built:** brain.js, memory.js, search.js (Brave), tenant.js, gmail.js, enerflo.js, content.js (YouTube/TikTok/PDF ingestion), coder.js (self-modify code), business.js (market research, ad copy, plans), trading.js (paper trading)
- **Agent loop:** 15 iterations, 22 tools, 3h cycle, revenue-focused
- **Discord commands:** !help, !learn, !research, !plan, !validate, !ad, !stock, !crypto, !portfolio, !build, !agent
- **HC Daily Tracker:** Live at /sales, 11 users, React frontend, Supabase tables (hc_*)
- **Proactive monitoring:** 8AM plan, 10AM stale alerts, 4PM no-log nudge, 6PM recap, Friday weekly report

### Intake App — CURRENT PRIORITY
**Location:** /Users/jarviswilliams/ai-bot/projects/intake/intake-app/
**Stack:** React Native + Expo SDK 55 + TypeScript, Supabase backend, Claude Vision for AI food scanning, RevenueCat for subscriptions, Zustand state management

**What's done:**
- Full MVP code built, TypeScript compiles clean
- Apple Developer Account: DONE (Mark's personal name)
- Supabase: CONFIGURED (.env has real credentials pointing to ioenuajkpwregmadqmbd.supabase.co)
- 10 screens: Welcome, Login, Onboarding, Results, TierSelect, Home, Stats, Scan, Plan, Profile
- 8 components: AdaptiveCard, CalRing, CoachInsight, LockOverlay, MacroBar, MealSlotCard, TabBar, WaterTracker
- 6 services: auth.ts, food.ts, supabase.ts, water.ts, weight.ts, workout.ts
- Navigation: Auth flow (Welcome→Login→Onboarding→Results→TierSelect) + Main tabs (Home, Stats, Scan, Plan, Profile)
- Zustand store with TDEE calculation, macro tracking, meal slots
- supabase-schema.sql: 7 tables (intake_*), RLS enabled, 24 seed foods, trigram search, 4 Jarvis CEO dashboard views (business_metrics, daily_active_users, feature_usage, conversion_funnel)
- Edge function: supabase/functions/scan-food/ (Claude 3.5 Sonnet, base64 image → nutrition JSON)
- iOS bundle ID: com.intake.app
- Camera + photo library permissions configured

**What's NOT done yet:**
1. Schema SQL has NOT been run in Supabase yet — need to execute supabase-schema.sql in Supabase SQL Editor (or via CLI)
2. Edge function NOT deployed — needs `supabase functions deploy scan-food` + ANTHROPIC_API_KEY secret
3. NO eas.json — need EAS Build config for TestFlight/App Store
4. EAS project ID empty in app.json (projectId: "")
5. NOT tested in iOS Simulator yet
6. RevenueCat: react-native-purchases installed but NOT connected (no API keys)
7. Barcode scanning: expo-barcode-scanner installed but integration unclear
8. No Supabase storage bucket for food scan images

**Monetization plan:** RevenueCat 3-tier — Free / Plus $4.99/mo / Pro $9.99/mo
**Key differentiator:** AI food scanning via Claude Vision (photo → macros). MyFitnessPal doesn't have this.

## NEXT STEPS (in order)
1. Run supabase-schema.sql against Supabase to create all Intake tables
2. Deploy the scan-food edge function + set ANTHROPIC_API_KEY secret
3. Test the app in iOS Simulator (npx expo start → press i)
4. Fix any runtime bugs
5. Set up eas.json + EAS Build
6. TestFlight build
7. Connect RevenueCat
8. App Store submission
9. Set up Meta Ads API + Google Ads API for Jarvis to run campaigns autonomously

## ACCOUNTS STATUS
- ✅ Apple Developer ($99/yr) — done
- ❌ Meta Business account — Mark needs to create (free)
- ❌ Google Ads account — Mark needs to create (free + budget)
- ❌ RevenueCat — needs setup + API keys
- ❌ ElevenLabs API — for voice calls later
- ❌ Alpaca brokerage — for live trading later
- ❌ Shopify partner — for e-commerce later

## HOW I WORK
- Build the fastest, simplest path. Don't go in circles.
- Concise responses. No fluff.
- Build it right the first time — don't make me come back to fix basics.
- Never re-suggest setup steps I've already completed. Check what exists first.
- Track incomplete tasks. Update me on what's done and what's next.
- Build to SCALE from day one.

Let's pick up where we left off. The Intake app MVP code is built. We need to get it running — start with running the schema, deploying the edge function, and testing in the simulator.
